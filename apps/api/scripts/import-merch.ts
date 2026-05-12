/* eslint-disable no-console */
/**
 * Одноразовый импорт-скрипт для файла "Merch _ Suvenir - stock.csv".
 *
 * Запуск:
 *   - Dry-run (только парсинг и отчёт):
 *       pnpm --filter @art-garage/api exec ts-node --transpile-only scripts/import-merch.ts
 *   - Реальный импорт (стирает текущие данные!):
 *       WIPE_BEFORE_IMPORT=yes pnpm --filter @art-garage/api exec ts-node --transpile-only scripts/import-merch.ts
 */

import { PrismaClient, type MovementType, type ProductUnit } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import * as fs from 'fs';

const FILE_PATH =
  process.env.IMPORT_FILE ??
  '/Users/aleksandrkorcevoj/art-garage-crm/Merch _ Suvenir - stock (1).xlsx - Лист1.csv';

const DEFAULT_PRICE = 100;
const DEFAULT_UNIT: ProductUnit = 'PCS';

const MONTH_LABELS = new Set([
  'IULIE',
  'SEPTEMBRIE',
  'OCTOMBRIE',
  'NOIEMBRIE',
  'DECEMBRIE',
  'IANUARIE',
  'FEBRUARIE',
  'Martie',
  'APRILIE',
  'MAI',
  'IUNIE',
  'AUGUST',
]);

// ---------- Парсер CSV ----------

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && text[i + 1] === '"') {
      cell += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function parseNum(s: string): number {
  if (!s) return 0;
  const t = s.trim().replace(/,/g, '.');
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(s: string, fallbackYear: number): Date {
  // Форматы: 05.04.2024 / 17.4.2025 / 23.02 (без года)
  const t = s.trim();
  const m = t.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/);
  if (!m) throw new Error(`Не понял дату: ${s}`);
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = m[3] ? Number(m[3]) : fallbackYear;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function isMonthDivider(top: string): boolean {
  const t = top.trim();
  if (!t) return true;
  if (/^\d+(\.\d+)?$/.test(t)) return true;
  if (MONTH_LABELS.has(t)) return true;
  return false;
}

// ---------- Структура данных ----------

interface ParsedVariant {
  modelKey: string; // нормализованное имя модели (для группировки)
  modelDisplay: string; // оригинальное имя
  color: string; // нормализованный
  size: string; // нормализованный (пусто если "-" или пустая ячейка)
  category: string;
  rowIndex: number;
  /** Приходы по датам (Date → qty) */
  incoming: Array<{ date: Date; qty: number; note?: string }>;
  /** Локальный поставщик (без даты) */
  supplierIn: number;
  /** Потери */
  lost: number;
  /** Образцы */
  samples: number;
  /** DEPOZIT — текущий остаток по файлу */
  depozit: number;
  /** Расход по клиентам: customerKey → [{date, qty}] */
  outflows: Array<{ customerKey: string; date: Date; qty: number; rawColumnLabel: string }>;
}

interface ParseResult {
  variants: ParsedVariant[];
  customers: Map<string, { displayName: string; aliases: Set<string> }>; // canonical key → meta
  categories: Set<string>;
  totals: {
    totalIn: number;
    totalOut: number;
    totalStock: number;
    totalLost: number;
    totalSamples: number;
  };
}

// ---------- Нормализация ----------

const normColor = (s: string) => s.trim().toUpperCase();
const normName = (s: string) => s.trim().replace(/\s+/g, ' ');
const customerKey = (s: string) => normName(s).toLowerCase();

// ---------- Анализ файла ----------

function analyzeFile(rows: string[][]): ParseResult {
  if (rows.length < 3) throw new Error('CSV слишком короткий');
  const hTop = rows[0]!;
  const hSub = rows[1]!;

  // Колонки приходов
  const incomingCols: Array<{ col: number; date: Date }> = [];
  for (let c = 4; c <= 15; c++) {
    const dateStr = (hSub[c] ?? '').trim();
    if (!dateStr) continue;
    // 23.02 и 02.03 без года → 2026 (свежие приходы по контексту)
    const fallbackYear = /\d{4}/.test(dateStr) ? 0 : 2026;
    incomingCols.push({ col: c, date: parseDate(dateStr, fallbackYear) });
  }

  // Колонки клиентов с инференсом месяца/года
  const clientCols: Array<{ col: number; rawLabel: string; date: Date }> = [];
  let curMonth = 6;
  let curYear = 2024;
  for (let c = 20; c < hTop.length; c++) {
    const top = (hTop[c] ?? '').trim();
    const sub = (hSub[c] ?? '').trim();

    // Маркеры начала месяца. "1.25"/"1.26" — явный год.
    const yearMonthMatch = top.match(/^(\d+)\.(\d{2})$/);
    if (yearMonthMatch) {
      curMonth = Number(yearMonthMatch[1]);
      curYear = 2000 + Number(yearMonthMatch[2]);
      if (!sub) continue;
    } else if (/^\d+$/.test(top)) {
      const m = Number(top);
      // Перешли через начало нового года?
      if (m < curMonth) {
        // Если месяц уменьшается без явного маркера '1.XX' — это, скорее всего, всё ещё тот же год.
        // Но этого в файле не происходит — все переходы через '1.25' и '1.26' явные.
      }
      curMonth = m;
      if (!sub) continue;
    } else if (MONTH_LABELS.has(top) && !sub) {
      continue;
    }

    // Имя клиента: row2 имеет приоритет, затем row1.
    let label: string;
    if (sub) label = sub;
    else if (top && !isMonthDivider(top)) label = top;
    else continue;

    const date = new Date(Date.UTC(curYear, curMonth - 1, 15, 12, 0, 0));
    clientCols.push({ col: c, rawLabel: label, date });
  }

  // Парсинг строк
  const variants: ParsedVariant[] = [];
  const customerMap = new Map<string, { displayName: string; aliases: Set<string> }>();
  const categories = new Set<string>();
  let curCategory = '';

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r]!;
    if (row.every((c) => !c?.trim())) continue;
    const cat = (row[0] ?? '').trim();
    if (cat) curCategory = cat;
    const model = normName(row[1] ?? '');
    const sizeRaw = (row[2] ?? '').trim();
    const size = sizeRaw === '-' ? '' : sizeRaw;
    const color = normColor(row[3] ?? '');
    if (!model) continue;
    // Цвет/размер не обязательны — если нет, вариация будет без этих атрибутов.

    if (curCategory) categories.add(curCategory);

    const v: ParsedVariant = {
      modelKey: model.toLowerCase(),
      modelDisplay: model,
      color,
      size,
      category: curCategory,
      rowIndex: r + 1,
      incoming: [],
      supplierIn: parseNum(row[16] ?? ''),
      lost: parseNum(row[17] ?? ''),
      samples: parseNum(row[18] ?? ''),
      depozit: parseNum(row[19] ?? ''),
      outflows: [],
    };

    for (const ic of incomingCols) {
      const q = parseNum(row[ic.col] ?? '');
      if (q !== 0) v.incoming.push({ date: ic.date, qty: q });
    }

    for (const cc of clientCols) {
      const q = parseNum(row[cc.col] ?? '');
      if (q !== 0) {
        const key = customerKey(cc.rawLabel);
        v.outflows.push({ customerKey: key, date: cc.date, qty: q, rawColumnLabel: cc.rawLabel });

        const existing = customerMap.get(key);
        if (existing) {
          existing.aliases.add(cc.rawLabel);
        } else {
          customerMap.set(key, { displayName: normName(cc.rawLabel), aliases: new Set([cc.rawLabel]) });
        }
      }
    }

    variants.push(v);
  }

  // Сводки
  const totalIn =
    variants.reduce((s, v) => s + v.incoming.reduce((a, b) => a + b.qty, 0), 0) +
    variants.reduce((s, v) => s + v.supplierIn, 0);
  const totalOut = variants.reduce((s, v) => s + v.outflows.reduce((a, b) => a + b.qty, 0), 0);
  const totalLost = variants.reduce((s, v) => s + v.lost, 0);
  const totalSamples = variants.reduce((s, v) => s + v.samples, 0);
  const totalStock = variants.reduce((s, v) => s + v.depozit, 0);

  return {
    variants,
    customers: customerMap,
    categories,
    totals: { totalIn, totalOut, totalStock, totalLost, totalSamples },
  };
}

// ---------- Группировка product → variants ----------

interface ProductGroup {
  modelKey: string;
  displayName: string;
  category: string;
  variants: ParsedVariant[];
}

function groupByProduct(variants: ParsedVariant[]): ProductGroup[] {
  const map = new Map<string, ProductGroup>();
  for (const v of variants) {
    const existing = map.get(v.modelKey);
    if (existing) {
      existing.variants.push(v);
    } else {
      map.set(v.modelKey, {
        modelKey: v.modelKey,
        displayName: v.modelDisplay,
        category: v.category,
        variants: [v],
      });
    }
  }
  return Array.from(map.values());
}

// ---------- Генерация SKU ----------

function generateSku(
  modelDisplay: string,
  color: string,
  size: string,
  takenSkus: Set<string>,
): string {
  const sanitize = (s: string) =>
    s
      .toUpperCase()
      .replace(/[^A-Z0-9 ]+/g, '')
      .trim()
      .replace(/\s+/g, '-');
  const base = sanitize(modelDisplay).slice(0, 30);
  const colorPart = sanitize(color).slice(0, 20);
  const sizePart = sanitize(size).slice(0, 20);
  const parts = [base, colorPart, sizePart].filter(Boolean);
  let candidate = parts.join('-') || 'SKU';
  let i = 1;
  let final = candidate;
  while (takenSkus.has(final)) {
    i++;
    final = `${candidate}-${i}`;
  }
  takenSkus.add(final);
  return final;
}

// ---------- Dry-run отчёт ----------

function printReport(parsed: ParseResult) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  АНАЛИЗ ИМПОРТА — DRY RUN');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Категорий:           ${parsed.categories.size}`);
  console.log(`Вариаций (variants): ${parsed.variants.length}`);
  const products = groupByProduct(parsed.variants);
  console.log(`Товаров (parents):   ${products.length}`);
  console.log(`Клиентов (после нормализации): ${parsed.customers.size}`);
  console.log('');
  console.log('Обороты:');
  console.log(`  Приходов:    ${parsed.totals.totalIn.toLocaleString('ru-RU')} ед.`);
  console.log(`  Выдач клиентам: ${parsed.totals.totalOut.toLocaleString('ru-RU')} ед.`);
  console.log(`  Потери:      ${parsed.totals.totalLost} ед.`);
  console.log(`  Образцы:     ${parsed.totals.totalSamples} ед.`);
  console.log(`  Остаток (DEPOZIT по файлу): ${parsed.totals.totalStock.toLocaleString('ru-RU')} ед.`);

  // Контроль формулы
  const expected =
    parsed.totals.totalIn -
    parsed.totals.totalOut -
    parsed.totals.totalLost -
    parsed.totals.totalSamples;
  const diff = parsed.totals.totalStock - expected;
  console.log('');
  console.log(`Контроль формулы: in - out - lost - samples = ${expected.toLocaleString('ru-RU')}`);
  if (Math.abs(diff) < 0.5) {
    console.log(`  ✓ совпадает с DEPOZIT (${parsed.totals.totalStock.toLocaleString('ru-RU')})`);
  } else {
    console.log(`  ✗ расхождение: ${diff.toLocaleString('ru-RU')}`);
  }

  // Алиасы клиентов
  console.log('');
  console.log('Слитые клиенты (несколько алиасов на одного):');
  let merged = 0;
  for (const c of parsed.customers.values()) {
    if (c.aliases.size > 1) {
      console.log(`  ${c.displayName} ← ${Array.from(c.aliases).join(' | ')}`);
      merged++;
    }
  }
  if (!merged) console.log('  (нет)');

  // Прогноз количества движений
  let movementCount = 0;
  for (const v of parsed.variants) {
    movementCount += v.incoming.length;
    if (v.supplierIn > 0) movementCount++;
    if (v.lost !== 0) movementCount++;
    if (v.samples !== 0) movementCount++;
    movementCount += v.outflows.length;
  }
  console.log('');
  console.log(`Будет создано движений: ~${movementCount.toLocaleString('ru-RU')}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// ---------- Реальный импорт ----------

async function performImport(parsed: ParseResult) {
  const prisma = new PrismaClient();
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
  if (!admin) {
    console.error('Не нашёл ADMIN пользователя — нечего привязать к движениям');
    process.exit(1);
  }

  console.log('Стираю существующие данные (Lot/Consumption → Movement → Variant → Product → Category, Customer, Supplier, AuditLog)...');
  await prisma.$transaction([
    prisma.lotConsumption.deleteMany(),
    prisma.stockLot.deleteMany(),
    prisma.stockMovement.deleteMany(),
    prisma.productVariant.deleteMany(),
    prisma.product.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.category.deleteMany(),
    prisma.auditLog.deleteMany(),
  ]);
  console.log('  ✓ wiped');

  // 1. Категории
  const catMap = new Map<string, string>();
  for (const cat of parsed.categories) {
    const created = await prisma.category.create({ data: { name: cat } });
    catMap.set(cat, created.id);
  }
  console.log(`  ✓ создано ${catMap.size} категорий`);

  // 2. Клиенты
  const customerIdByKey = new Map<string, string>();
  for (const [key, info] of parsed.customers) {
    const note =
      info.aliases.size > 1
        ? `Алиасы из исходного файла: ${Array.from(info.aliases).join(' | ')}`
        : null;
    const created = await prisma.customer.create({
      data: { name: info.displayName, note },
    });
    customerIdByKey.set(key, created.id);
  }
  console.log(`  ✓ создано ${customerIdByKey.size} клиентов`);

  // 3. Товары + вариации
  const products = groupByProduct(parsed.variants);
  const variantIdByKey = new Map<string, string>(); // `${modelKey}|${color}` → variantId
  const takenSkus = new Set<string>();

  // Внутри товара группируем строки по (color, size) — могут быть дубли в файле,
  // их нужно слить в одну вариацию (стоки и движения суммируются естественно через FK).
  for (const p of products) {
    const product = await prisma.product.create({
      data: {
        name: p.displayName,
        unit: DEFAULT_UNIT,
        categoryId: p.category ? catMap.get(p.category) ?? null : null,
      },
    });
    const seen = new Set<string>();
    for (const v of p.variants) {
      const variantKey = `${v.color}|${v.size}`;
      if (seen.has(variantKey)) continue;
      seen.add(variantKey);
      const sku = generateSku(p.displayName, v.color, v.size, takenSkus);
      const attributes: Record<string, string> = {};
      if (v.color) attributes.color = v.color;
      if (v.size) attributes.size = v.size;
      const variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku,
          attributes,
          price: new Decimal(DEFAULT_PRICE),
        },
      });
      variantIdByKey.set(`${p.modelKey}|${variantKey}`, variant.id);
    }
  }
  console.log(`  ✓ создано ${products.length} товаров и ${variantIdByKey.size} вариаций`);

  // 4. Движения — собираем per variant с правильным порядком,
  // применяем lot-aware логику: IN/ADJUST+ → lot; OUT/ADJUST- → FIFO consumption.
  type PendingMovement = {
    type: MovementType;
    quantity: number;
    supplierId: string | null;
    customerId: string | null;
    note: string;
    createdAt: Date;
  };

  // Группируем все движения по variantId
  const perVariantMovements = new Map<string, PendingMovement[]>();
  for (const v of parsed.variants) {
    const variantId = variantIdByKey.get(`${v.modelKey}|${v.color}|${v.size}`);
    if (!variantId) continue;
    const list = perVariantMovements.get(variantId) ?? [];

    for (const inc of v.incoming) {
      list.push({
        type: 'IN',
        quantity: inc.qty,
        supplierId: null,
        customerId: null,
        note: 'импорт: приход по дате',
        createdAt: inc.date,
      });
    }
    if (v.supplierIn > 0) {
      list.push({
        type: 'IN',
        quantity: v.supplierIn,
        supplierId: null,
        customerId: null,
        note: 'импорт: Furnizor local',
        createdAt: new Date(Date.UTC(2024, 5, 1, 12, 0, 0)),
      });
    }
    if (v.lost !== 0) {
      list.push({
        type: 'ADJUST',
        quantity: -Math.abs(v.lost),
        supplierId: null,
        customerId: null,
        note: 'импорт: Pierdute (потери)',
        createdAt: new Date(Date.UTC(2026, 0, 1, 12, 0, 0)),
      });
    }
    if (v.samples !== 0) {
      list.push({
        type: 'ADJUST',
        quantity: -Math.abs(v.samples),
        supplierId: null,
        customerId: null,
        note: 'импорт: Probe (образцы)',
        createdAt: new Date(Date.UTC(2026, 0, 1, 12, 0, 0)),
      });
    }
    for (const out of v.outflows) {
      const customerId = customerIdByKey.get(out.customerKey) ?? null;
      list.push({
        type: 'OUT',
        quantity: out.qty,
        supplierId: null,
        customerId,
        note: `импорт: ${out.rawColumnLabel}`,
        createdAt: out.date,
      });
    }

    perVariantMovements.set(variantId, list);
  }

  // Применяем для каждой вариации в хронологическом порядке.
  // Lot-структура поддерживается прямо в памяти, в БД пишем после.
  let totalMovements = 0;
  let totalLots = 0;
  let deficitMovements = 0;

  for (const [variantId, movements] of perVariantMovements) {
    // Stable sort: by date ascending; tie-break — positives first (IN/ADJUST+), потом negatives.
    // Иначе при одинаковой дате OUT может обработаться раньше IN и потребует deficit-lot.
    movements.sort((a, b) => {
      const t = a.createdAt.getTime() - b.createdAt.getTime();
      if (t !== 0) return t;
      const aPos = a.type === 'IN' || (a.type === 'ADJUST' && a.quantity > 0);
      const bPos = b.type === 'IN' || (b.type === 'ADJUST' && b.quantity > 0);
      if (aPos && !bPos) return -1;
      if (!aPos && bPos) return 1;
      return 0;
    });

    // In-memory FIFO ledger для этой вариации.
    type Lot = { id: string; remaining: number };
    const lots: Lot[] = [];

    for (const m of movements) {
      const isPositive = m.type === 'IN' || (m.type === 'ADJUST' && m.quantity > 0);

      if (isPositive) {
        const qty = Math.abs(m.quantity);
        const movement = await prisma.stockMovement.create({
          data: {
            type: m.type,
            variantId,
            quantity: m.quantity,
            supplierId: m.supplierId,
            customerId: null,
            userId: admin.id,
            note: m.note,
            totalCost: 0,
            createdAt: m.createdAt,
          },
        });
        const lot = await prisma.stockLot.create({
          data: {
            variantId,
            unitCost: new Decimal(0),
            initialQuantity: qty,
            remainingQuantity: qty,
            receivedAt: m.createdAt,
            supplierId: m.supplierId,
            note: m.note,
            userId: admin.id,
            createdByMovementId: movement.id,
          },
        });
        lots.push({ id: lot.id, remaining: qty });
        totalMovements++;
        totalLots++;
        continue;
      }

      // OUT / ADJUST-
      const needed = Math.abs(m.quantity);
      let remaining = needed;
      const consumptions: Array<{ lotId: string; qty: number }> = [];

      for (const lot of lots) {
        if (remaining <= 0) break;
        if (lot.remaining <= 0) continue;
        const take = Math.min(remaining, lot.remaining);
        consumptions.push({ lotId: lot.id, qty: take });
        lot.remaining -= take;
        remaining -= take;
      }

      // Дефицит — создаём phantom IN с qty=0 и lot qty=0 (FK-плейсхолдер).
      // Затем consumption на phantom lot уведёт его remainingQuantity в минус —
      // это правильно отражает дисбаланс исходного файла, не искажая sum(quantity).
      if (remaining > 0.0001) {
        deficitMovements++;
        const phantomIN = await prisma.stockMovement.create({
          data: {
            type: 'IN',
            variantId,
            quantity: 0, // важно: 0, чтобы не искажать sum_IN_quantity
            supplierId: null,
            customerId: null,
            userId: admin.id,
            note: 'импорт: technical phantom для дисбаланса исходника',
            totalCost: 0,
            createdAt: m.createdAt,
          },
        });
        const phantomLot = await prisma.stockLot.create({
          data: {
            variantId,
            unitCost: new Decimal(0),
            initialQuantity: 0,
            remainingQuantity: 0,
            receivedAt: m.createdAt,
            userId: admin.id,
            createdByMovementId: phantomIN.id,
            note: 'phantom-партия для дисбаланса исходника',
          },
        });
        totalMovements++;
        totalLots++;
        consumptions.push({ lotId: phantomLot.id, qty: remaining });
        lots.push({ id: phantomLot.id, remaining: 0 });
      }

      const movement = await prisma.stockMovement.create({
        data: {
          type: m.type,
          variantId,
          quantity: m.quantity, // signed
          supplierId: null,
          customerId: m.customerId,
          userId: admin.id,
          note: m.note,
          totalCost: 0,
          createdAt: m.createdAt,
        },
      });
      for (const c of consumptions) {
        await prisma.lotConsumption.create({
          data: { lotId: c.lotId, movementId: movement.id, quantity: c.qty },
        });
        await prisma.stockLot.update({
          where: { id: c.lotId },
          data: { remainingQuantity: { decrement: c.qty } },
        });
      }
      totalMovements++;
    }
  }

  console.log(`  ✓ создано ${totalMovements.toLocaleString('ru-RU')} движений`);
  console.log(`  ✓ создано ${totalLots.toLocaleString('ru-RU')} партий (включая deficit)`);
  if (deficitMovements > 0) {
    console.log(`  ⚠ ${deficitMovements} списаний потребовали deficit-партии (исходник с минусом)`);
  }

  // 5. Валидация: пересчитываем stock по каждой вариации, сравниваем с DEPOZIT
  console.log('');
  console.log('Валидация: сверка remaining stock с DEPOZIT...');
  const grouped = await prisma.stockMovement.groupBy({
    by: ['variantId', 'type'],
    _sum: { quantity: true },
  });
  const stockByVariant = new Map<string, number>();
  for (const g of grouped) {
    const sum = Number(g._sum.quantity ?? 0);
    const sign = g.type === 'OUT' ? -1 : 1;
    stockByVariant.set(g.variantId, (stockByVariant.get(g.variantId) ?? 0) + sign * sum);
  }
  // Суммируем DEPOZIT из файла по (model, color, size) — если в файле было несколько строк
  // с одной и той же парой, db_stock = sum их движений.
  const fileDepozitByVariant = new Map<string, number>();
  for (const v of parsed.variants) {
    const variantId = variantIdByKey.get(`${v.modelKey}|${v.color}|${v.size}`);
    if (!variantId) continue;
    fileDepozitByVariant.set(variantId, (fileDepozitByVariant.get(variantId) ?? 0) + v.depozit);
  }

  let mismatches = 0;
  for (const [variantId, fileSum] of fileDepozitByVariant) {
    const dbStock = stockByVariant.get(variantId) ?? 0;
    if (Math.abs(dbStock - fileSum) > 0.001) {
      mismatches++;
      const variant = parsed.variants.find(
        (v) => variantIdByKey.get(`${v.modelKey}|${v.color}|${v.size}`) === variantId,
      );
      console.log(
        `  ✗ ${variant?.modelDisplay} / ${variant?.color}${variant?.size ? ` (${variant.size})` : ''}: file=${fileSum}, db=${dbStock}, diff=${dbStock - fileSum}`,
      );
    }
  }
  if (mismatches === 0) {
    console.log(`  ✓ все ${fileDepozitByVariant.size} вариаций совпадают с DEPOZIT`);
  } else {
    console.log(`  ✗ расхождений: ${mismatches} из ${fileDepozitByVariant.size}`);
  }

  await prisma.$disconnect();
}

// ---------- Main ----------

async function main() {
  const text = fs.readFileSync(FILE_PATH, 'utf-8');
  const rows = parseCsv(text);
  const parsed = analyzeFile(rows);
  printReport(parsed);

  if (process.env.WIPE_BEFORE_IMPORT === 'yes') {
    console.log('');
    console.log('WIPE_BEFORE_IMPORT=yes — выполняю реальный импорт...');
    console.log('');
    await performImport(parsed);
  } else {
    console.log('');
    console.log('Это был DRY-RUN. Для реального импорта запусти с WIPE_BEFORE_IMPORT=yes');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
