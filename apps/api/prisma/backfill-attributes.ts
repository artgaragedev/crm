/**
 * Идемпотентный backfill: переносит существующие ProductVariant.attributes (JSON)
 * в реляционную модель Attribute/AttributeValue/ProductAttribute/VariantAttributeValue.
 *
 * Запуск:
 *   pnpm --filter @art-garage/api exec tsx prisma/backfill-attributes.ts
 *
 * Безопасен для повторного запуска: всё через upsert и точечные проверки существования.
 *
 * Стратегия:
 *   1. Сканируем все ProductVariant.attributes JSON.
 *   2. Для каждого ключа (например, "color", "size") — upsert Attribute с code=KEY.upper().
 *   3. Для каждого value — upsert AttributeValue в этом атрибуте (value=VALUE.upper()).
 *   4. Для каждого варианта — upsert ProductAttribute (привязка оси к товару) +
 *      upsert VariantAttributeValue.
 *   5. Перезаписываем JSON-снапшот вариации в нормализованной форме (UPPER ключи и значения).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ATTRIBUTE_LABELS: Record<string, { name: string; type: 'TEXT' | 'SWATCH' | 'NUMBER' }> = {
  COLOR: { name: 'Цвет', type: 'SWATCH' },
  SIZE: { name: 'Размер', type: 'TEXT' },
  MATERIAL: { name: 'Материал', type: 'TEXT' },
  CAPACITY: { name: 'Объём', type: 'NUMBER' },
  VOLUME: { name: 'Объём', type: 'NUMBER' },
};

const COLOR_SWATCHES: Record<string, string> = {
  BLACK: '#000000',
  WHITE: '#ffffff',
  RED: '#dc2626',
  ORANGE: '#f97316',
  YELLOW: '#eab308',
  GREEN: '#16a34a',
  BLUE: '#2563eb',
  ROYAL_BLUE: '#1d4ed8',
  NAVY_BLUE: '#1e3a8a',
  NAVY: '#1e3a8a',
  TRANSPARENT: '#e5e7eb',
  GREY: '#6b7280',
  GRAY: '#6b7280',
  BROWN: '#92400e',
  PINK: '#ec4899',
  PURPLE: '#9333ea',
};

function normalizeKey(k: string): string {
  return k
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .replace(/_+/gu, '_');
}

function normalizeValue(v: string): string {
  return v
    .trim()
    .toUpperCase()
    .replace(/\s+/gu, '_');
}

async function ensureAttribute(code: string) {
  const label = ATTRIBUTE_LABELS[code] ?? { name: code, type: 'TEXT' as const };
  const existing = await prisma.attribute.findUnique({ where: { code } });
  if (existing) return existing;
  // name тоже unique — если такая запись уже есть с другим code (мало вероятно), сохраняем имя.
  try {
    return await prisma.attribute.create({
      data: { code, name: label.name, type: label.type },
    });
  } catch {
    // name collision — добавим суффикс
    return await prisma.attribute.create({
      data: { code, name: `${label.name} (${code})`, type: label.type },
    });
  }
}

async function ensureValue(attributeId: string, attrCode: string, value: string) {
  const existing = await prisma.attributeValue.findUnique({
    where: { attributeId_value: { attributeId, value } },
  });
  if (existing) return existing;
  const code = value.slice(0, 16) || 'X';
  const swatch = attrCode === 'COLOR' ? (COLOR_SWATCHES[value] ?? null) : null;
  try {
    return await prisma.attributeValue.create({
      data: { attributeId, value, code, swatch },
    });
  } catch {
    // code collision внутри атрибута — добавим хвост
    return await prisma.attributeValue.create({
      data: {
        attributeId,
        value,
        code: `${code}_${Date.now().toString(36).slice(-4)}`.slice(0, 16),
        swatch,
      },
    });
  }
}

async function main() {
  const variants = await prisma.productVariant.findMany({
    select: { id: true, productId: true, attributes: true },
  });
  console.log(`[backfill] variants to scan: ${variants.length}`);

  let attrsCreated = 0;
  let valuesCreated = 0;
  let productAttrsLinked = 0;
  let variantValuesLinked = 0;
  let snapshotsUpdated = 0;

  const attrCache = new Map<string, string>(); // code → attributeId
  const valueCache = new Map<string, string>(); // `${attrId}|${value}` → valueId

  for (const v of variants) {
    const raw = (v.attributes ?? {}) as Record<string, unknown>;
    if (typeof raw !== 'object' || raw === null) continue;
    const entries = Object.entries(raw)
      .map(([k, val]) => [normalizeKey(k), typeof val === 'string' ? normalizeValue(val) : ''])
      .filter(([k, val]) => k && val) as [string, string][];
    if (entries.length === 0) continue;

    const newSnapshot: Record<string, string> = {};

    for (const [attrCode, value] of entries) {
      // attribute
      let attrId = attrCache.get(attrCode);
      if (!attrId) {
        const before = await prisma.attribute.findUnique({ where: { code: attrCode } });
        const a = before ?? (await ensureAttribute(attrCode));
        if (!before) attrsCreated++;
        attrId = a.id;
        attrCache.set(attrCode, attrId);
      }

      // value
      const vKey = `${attrId}|${value}`;
      let valueId = valueCache.get(vKey);
      if (!valueId) {
        const before = await prisma.attributeValue.findUnique({
          where: { attributeId_value: { attributeId: attrId, value } },
        });
        const av = before ?? (await ensureValue(attrId, attrCode, value));
        if (!before) valuesCreated++;
        valueId = av.id;
        valueCache.set(vKey, valueId);
      }

      // ProductAttribute (idempotent — composite PK)
      const pa = await prisma.productAttribute.findUnique({
        where: { productId_attributeId: { productId: v.productId, attributeId: attrId } },
      });
      if (!pa) {
        const existingForProduct = await prisma.productAttribute.count({
          where: { productId: v.productId },
        });
        await prisma.productAttribute.create({
          data: {
            productId: v.productId,
            attributeId: attrId,
            position: existingForProduct,
          },
        });
        productAttrsLinked++;
      }

      // VariantAttributeValue (idempotent — composite PK)
      const vav = await prisma.variantAttributeValue.findUnique({
        where: { variantId_attributeId: { variantId: v.id, attributeId: attrId } },
      });
      if (!vav) {
        await prisma.variantAttributeValue.create({
          data: { variantId: v.id, attributeId: attrId, attributeValueId: valueId },
        });
        variantValuesLinked++;
      } else if (vav.attributeValueId !== valueId) {
        // Старый JSON и реляционка разъехались — приоритет JSON-снапшоту (это явный backfill).
        await prisma.variantAttributeValue.update({
          where: { variantId_attributeId: { variantId: v.id, attributeId: attrId } },
          data: { attributeValueId: valueId },
        });
      }

      newSnapshot[attrCode] = value;
    }

    // Перезаписываем JSON-снапшот в нормализованной форме.
    const currentSnapshot = JSON.stringify(raw);
    const targetSnapshot = JSON.stringify(newSnapshot);
    if (currentSnapshot !== targetSnapshot) {
      await prisma.productVariant.update({
        where: { id: v.id },
        data: { attributes: newSnapshot },
      });
      snapshotsUpdated++;
    }
  }

  console.log(`[backfill] done:
    attributes created:        ${attrsCreated}
    values created:            ${valuesCreated}
    product-attribute links:   ${productAttrsLinked}
    variant-value links:       ${variantValuesLinked}
    snapshots normalized:      ${snapshotsUpdated}
  `);
}

main()
  .catch((err) => {
    console.error('[backfill] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
