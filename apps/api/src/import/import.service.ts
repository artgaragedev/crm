import { Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface ImportRow {
  productName: string;
  unit?: 'PCS' | 'KG' | 'L' | 'M' | 'PACK';
  categoryName?: string | null;
  sku: string;
  color?: string;
  attributes?: Record<string, string>;
  price?: number | null;
  reorderLevel?: number | null;
  initialStock?: number;
  /** имя поставщика для начального ADJUST (или приходов) — опционально */
  supplierName?: string | null;
  description?: string;
}

export interface ImportReport {
  total: number;
  productsCreated: number;
  productsReused: number;
  variantsCreated: number;
  variantsSkipped: number;
  initialStocksCreated: number;
  errors: Array<{ row: number; sku?: string; message: string }>;
}

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Импортирует список вариаций. Каждая строка обрабатывается отдельно — ошибка на одной не валит остальные.
   * - Категория ищется по name (case-insensitive). Если нет — создаётся (без цвета).
   * - Товар (Product) ищется по name. Если нет — создаётся с unit и categoryId.
   * - Если такой Product уже есть и unit отличается — error для строки.
   * - Variant с указанным SKU создаётся; если SKU уже есть — error.
   * - Если задан initialStock>0 — создаётся ADJUST с этим количеством, как стартовый остаток.
   */
  async importVariants(
    rows: ImportRow[],
    userId?: string,
  ): Promise<ImportReport> {
    const report: ImportReport = {
      total: rows.length,
      productsCreated: 0,
      productsReused: 0,
      variantsCreated: 0,
      variantsSkipped: 0,
      initialStocksCreated: 0,
      errors: [],
    };

    // Кэш для оптимизации — категории/товары ищем один раз.
    const categoryCache = new Map<string, string>(); // name → id
    const productCache = new Map<string, { id: string; unit: string }>(); // name → meta

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const rowNum = i + 1;

      try {
        await this.processRow(row, rowNum, userId, report, categoryCache, productCache);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        report.errors.push({ row: rowNum, sku: row.sku, message });
      }
    }

    return report;
  }

  private async processRow(
    row: ImportRow,
    rowNum: number,
    userId: string | undefined,
    report: ImportReport,
    categoryCache: Map<string, string>,
    productCache: Map<string, { id: string; unit: string }>,
  ) {
    if (!row.productName?.trim()) {
      throw new Error('productName обязателен');
    }
    if (!row.sku?.trim()) {
      throw new Error('sku обязателен');
    }

    const productName = row.productName.trim();
    const sku = row.sku.trim();
    const unit = row.unit ?? 'PCS';

    await this.prisma.$transaction(async (tx) => {
      // 1. Категория.
      let categoryId: string | null = null;
      if (row.categoryName?.trim()) {
        const catName = row.categoryName.trim();
        if (categoryCache.has(catName)) {
          categoryId = categoryCache.get(catName)!;
        } else {
          const existing = await tx.category.findFirst({
            where: { name: { equals: catName, mode: 'insensitive' } },
            select: { id: true, name: true },
          });
          if (existing) {
            categoryId = existing.id;
            categoryCache.set(catName, existing.id);
          } else {
            const created = await tx.category.create({
              data: { name: catName },
              select: { id: true },
            });
            categoryId = created.id;
            categoryCache.set(catName, created.id);
            await this.audit.log({
              entity: 'Category',
              entityId: created.id,
              action: 'CREATE',
              userId,
              note: 'импорт',
            });
          }
        }
      }

      // 2. Product.
      let productId: string;
      let cached = productCache.get(productName);
      if (!cached) {
        // name больше не глобально @unique (partial unique scoped to deletedAt IS NULL).
        // Импортируем — переиспользуем только живой товар; soft-deleted игнорируем (импорт создаст новый).
        const existing = await tx.product.findFirst({
          where: { name: productName, deletedAt: null },
          select: { id: true, unit: true },
        });
        if (existing) {
          if (existing.unit !== unit) {
            throw new Error(
              `Товар "${productName}" уже есть с unit=${existing.unit}, импортируется с unit=${unit}`,
            );
          }
          productId = existing.id;
          productCache.set(productName, { id: productId, unit: existing.unit });
          report.productsReused++;
        } else {
          const created = await tx.product.create({
            data: {
              name: productName,
              unit,
              description: row.description?.trim() || null,
              categoryId,
            },
            select: { id: true, unit: true },
          });
          productId = created.id;
          productCache.set(productName, { id: productId, unit: created.unit });
          report.productsCreated++;
          await this.audit.log({
            entity: 'Product',
            entityId: created.id,
            action: 'CREATE',
            userId,
            note: 'импорт',
          });
        }
      } else {
        if (cached.unit !== unit) {
          throw new Error(
            `Товар "${productName}" в этой пачке уже с unit=${cached.unit}, новый unit=${unit}`,
          );
        }
        productId = cached.id;
        report.productsReused++;
      }

      // 3. Variant. Атрибуты: color если задан, плюс свободные attributes.
      const attributes: Record<string, string> = {};
      if (row.color?.trim()) attributes.color = row.color.trim();
      if (row.attributes) {
        for (const [k, v] of Object.entries(row.attributes)) {
          if (typeof v === 'string' && v.trim()) attributes[k] = v.trim();
        }
      }

      const skuExists = await tx.productVariant.findUnique({
        where: { sku },
        select: { id: true },
      });
      if (skuExists) {
        report.variantsSkipped++;
        throw new Error(`SKU "${sku}" уже занят — пропущено`);
      }

      const variant = await tx.productVariant.create({
        data: {
          productId,
          sku,
          attributes,
          price: row.price ?? null,
          reorderLevel: row.reorderLevel ?? null,
        },
        select: { id: true },
      });
      report.variantsCreated++;
      await this.audit.log({
        entity: 'Variant',
        entityId: variant.id,
        action: 'CREATE',
        userId,
        note: 'импорт',
      });

      // 4. Initial stock (опционально).
      if (row.initialStock && row.initialStock > 0) {
        // Поставщик: ищем по имени, если задано. Не создаём (намеренно — поставщик отдельная сущность с реквизитами).
        let supplierId: string | null = null;
        if (row.supplierName?.trim()) {
          const supName = row.supplierName.trim();
          const sup = await tx.supplier.findFirst({
            where: { name: { equals: supName, mode: 'insensitive' } },
            select: { id: true },
          });
          supplierId = sup?.id ?? null;
        }

        await tx.stockMovement.create({
          data: {
            type: supplierId ? 'IN' : 'ADJUST',
            variantId: variant.id,
            quantity: row.initialStock,
            supplierId,
            userId: userId ?? (await this.fallbackUserId(tx)),
            note: 'импорт: стартовый остаток',
          },
        });
        report.initialStocksCreated++;
      }
    });
  }

  /** Если userId не задан (внутренний вызов из CLI) — берём первого ADMIN'а. Импорт всегда требует юзера. */
  private async fallbackUserId(tx: Prisma.TransactionClient | PrismaClient): Promise<string> {
    const admin = await tx.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true },
    });
    if (!admin) throw new Error('Не нашли админа для атрибуции движения');
    return admin.id;
  }
}
