import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  buildVariantSku,
  type CreateProductWithVariantInput,
  type CreateVariantInput,
  type PaginationQuery,
  type UpdateVariantInput,
  type VariantAttributes,
} from '@art-garage/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProductsService } from '../products/products.service';

type VariantRow = Prisma.ProductVariantGetPayload<{
  include: {
    product: {
      include: {
        category: true;
        _count: { select: { variants: true } };
      };
    };
  };
}>;

@Injectable()
export class VariantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly products: ProductsService,
  ) {}

  async list(
    query: PaginationQuery & { productId?: string; categoryId?: string },
  ) {
    const where: Prisma.ProductVariantWhereInput = {
      product: {
        deletedAt: null,
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      },
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.search
        ? {
            OR: [
              { sku: { contains: query.search, mode: 'insensitive' } },
              { product: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.productVariant.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ product: { name: 'asc' } }, { sku: 'asc' }],
        include: {
          product: {
            include: {
              category: true,
              _count: { select: { variants: true } },
            },
          },
        },
      }),
      this.prisma.productVariant.count({ where }),
    ]);

    const stocks = await this.computeStocks(items.map((v) => v.id));

    return {
      items: items.map((v) => this.serialize(v, stocks.get(v.id) ?? 0)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findOne(id: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id },
      include: {
        product: {
          include: {
            category: true,
            _count: { select: { variants: true } },
          },
        },
      },
    });
    if (!variant) throw new NotFoundException('Variant not found');
    const stocks = await this.computeStocks([id]);
    return this.serialize(variant, stocks.get(id) ?? 0);
  }

  async create(input: CreateVariantInput, userId?: string) {
    await this.assertProductExists(input.productId);
    const normalized = this.normalizeAttributes(input.attributes);
    await this.assertNoDuplicateAttributes(input.productId, normalized);

    let sku = input.sku?.trim();
    if (!sku) {
      // Артикул вариации = product.code + хвост из атрибутов. Если у товара ещё нет code
      // (наследие или импорт) — выделим его сейчас атомарно.
      const product = await this.ensureProductCode(input.productId);
      sku = await this.makeUniqueVariantSku(product.code!, normalized);
    }

    try {
      const created = await this.prisma.productVariant.create({
        data: {
          productId: input.productId,
          sku,
          attributes: normalized,
          price: input.price ?? null,
          reorderLevel: input.reorderLevel ?? null,
        },
        include: {
          product: {
            include: {
              category: true,
              _count: { select: { variants: true } },
            },
          },
        },
      });
      const result = this.serialize(created, 0);
      await this.audit.log({
        entity: 'Variant',
        entityId: created.id,
        action: 'CREATE',
        userId,
        after: result,
      });
      return result;
    } catch (err) {
      this.translatePrismaError(err);
      throw err;
    }
  }

  async createWithProduct(input: CreateProductWithVariantInput, userId?: string) {
    if (input.product.categoryId) {
      await this.assertCategoryExists(input.product.categoryId);
    }

    const variantAttrs = this.normalizeAttributes(input.variant.attributes);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Аллокируем code для нового товара через ProductsService (одна транзакция).
        const code = await this.products.allocateProductCode(
          tx,
          input.product.categoryId ?? null,
          input.product.name,
        );
        const product = await tx.product.create({
          data: {
            name: input.product.name,
            code,
            unit: input.product.unit,
            description: input.product.description ?? null,
            categoryId: input.product.categoryId ?? null,
          },
        });

        const sku =
          input.variant.sku?.trim() ||
          (await this.makeUniqueVariantSku(code, variantAttrs, tx));

        const variant = await tx.productVariant.create({
          data: {
            productId: product.id,
            sku,
            attributes: variantAttrs,
            price: input.variant.price ?? null,
            reorderLevel: input.variant.reorderLevel ?? null,
          },
          include: {
            product: {
              include: {
                category: true,
                _count: { select: { variants: true } },
              },
            },
          },
        });

        return { variant: this.serialize(variant, 0), productId: product.id };
      });

      await this.audit.log({
        entity: 'Product',
        entityId: result.productId,
        action: 'CREATE',
        userId,
        after: result.variant.product,
      });
      await this.audit.log({
        entity: 'Variant',
        entityId: result.variant.id,
        action: 'CREATE',
        userId,
        after: result.variant,
      });

      return result.variant;
    } catch (err) {
      this.translatePrismaError(err);
      throw err;
    }
  }

  async update(id: string, input: UpdateVariantInput, userId?: string) {
    const before = await this.findOne(id);

    const normalized =
      input.attributes !== undefined ? this.normalizeAttributes(input.attributes) : undefined;
    if (normalized !== undefined) {
      await this.assertNoDuplicateAttributes(before.productId, normalized, id);
    }

    try {
      const updated = await this.prisma.productVariant.update({
        where: { id },
        data: {
          sku: input.sku,
          attributes: normalized,
          price: input.price,
          reorderLevel: input.reorderLevel,
        },
        include: {
          product: {
            include: {
              category: true,
              _count: { select: { variants: true } },
            },
          },
        },
      });
      const stocks = await this.computeStocks([id]);
      const result = this.serialize(updated, stocks.get(id) ?? 0);
      await this.audit.log({
        entity: 'Variant',
        entityId: id,
        action: 'UPDATE',
        userId,
        before,
        after: result,
      });
      return result;
    } catch (err) {
      this.translatePrismaError(err);
      throw err;
    }
  }

  /**
   * Удаление вариации. Если на неё есть движения — отказ (Prisma P2003 от Restrict).
   * Если это была последняя вариация и cascadeProduct=true — удаляем и родительский товар.
   */
  async remove(id: string, cascadeProduct = false, userId?: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id },
      select: {
        id: true,
        productId: true,
        product: { select: { _count: { select: { variants: true } } } },
      },
    });
    if (!variant) throw new NotFoundException('Variant not found');

    try {
      await this.prisma.productVariant.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new BadRequestException('Нельзя удалить: на вариацию есть движения учёта');
      }
      throw err;
    }

    await this.audit.log({
      entity: 'Variant',
      entityId: id,
      action: 'DELETE',
      userId,
    });

    if (cascadeProduct && variant.product._count.variants <= 1) {
      try {
        await this.prisma.product.delete({ where: { id: variant.productId } });
        await this.audit.log({
          entity: 'Product',
          entityId: variant.productId,
          action: 'DELETE',
          userId,
          note: 'Каскадно: удалена последняя вариация',
        });
      } catch {
        // не критично — оставим parent висеть
      }
    }
  }

  /**
   * Гарантирует что у товара есть code (артикул). Если нет — атомарно выделяет seq из категории
   * и проставляет. Возвращает товар с гарантированно непустым code.
   */
  private async ensureProductCode(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, code: true, categoryId: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.code) return product;

    // У товара ещё нет кода (legacy/импорт). Аллокируем сейчас.
    const updated = await this.prisma.$transaction(async (tx) => {
      const code = await this.products.allocateProductCode(
        tx,
        product.categoryId,
        product.name,
      );
      return tx.product.update({
        where: { id: product.id },
        data: { code },
        select: { id: true, name: true, code: true, categoryId: true },
      });
    });
    return updated;
  }

  /**
   * SKU вариации = product.code + variant tail. При коллизии — числовой суффикс.
   *   "KRU000001-RED" → если занят, "KRU000001-RED-2"
   */
  private async makeUniqueVariantSku(
    productCode: string,
    attributes: Prisma.JsonObject,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const color = typeof attributes.color === 'string' ? attributes.color : null;
    const size = typeof attributes.size === 'string' ? attributes.size : null;
    const candidate = buildVariantSku(productCode, color, size);
    const client = tx ?? this.prisma;
    let result = candidate;
    let i = 1;
    while (true) {
      const exists = await client.productVariant.findUnique({
        where: { sku: result },
        select: { id: true },
      });
      if (!exists) return result;
      i++;
      result = `${candidate}-${i}`;
      if (i > 100) return `${candidate}-${Date.now()}`;
    }
  }

  private normalizeAttributes(attrs: VariantAttributes | undefined): Prisma.JsonObject {
    if (!attrs) return {};
    const out: Prisma.JsonObject = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (v && typeof v === 'string' && v.trim()) {
        out[k] = v.trim();
      }
    }
    return out;
  }

  private async assertExists(id: string) {
    const exists = await this.prisma.productVariant.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Variant not found');
  }

  private async assertProductExists(productId: string) {
    const exists = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!exists) throw new BadRequestException('Product not found');
  }

  /**
   * Не даём создать вторую вариацию того же товара с идентичными атрибутами.
   * Сравнение по канонической форме (отсортированные ключи + trim values).
   * Postgres JSON-сравнения через @> + узкая выборка.
   */
  private async assertNoDuplicateAttributes(
    productId: string,
    attributes: Prisma.JsonObject,
    excludeId?: string,
  ) {
    const sameProduct = await this.prisma.productVariant.findMany({
      where: {
        productId,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true, attributes: true },
    });
    const target = JSON.stringify(canonicalize(attributes));
    const conflict = sameProduct.find(
      (v) => JSON.stringify(canonicalize((v.attributes ?? {}) as Prisma.JsonObject)) === target,
    );
    if (conflict) {
      throw new BadRequestException(
        'У этого товара уже есть вариация с такими же атрибутами',
      );
    }
  }

  private async assertCategoryExists(categoryId: string) {
    const exists = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!exists) throw new BadRequestException('Category not found');
  }

  private translatePrismaError(err: unknown): never | void {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? '';
      if (target.includes('sku')) {
        throw new BadRequestException('SKU должен быть уникальным');
      }
      if (target.includes('name')) {
        throw new BadRequestException('Товар с таким названием уже существует');
      }
      throw new BadRequestException(`Уникальный конфликт: ${target}`);
    }
  }

  private serialize(v: VariantRow, currentStock: number) {
    return {
      id: v.id,
      productId: v.productId,
      sku: v.sku,
      attributes: (v.attributes ?? {}) as VariantAttributes,
      price: v.price ? Number(v.price) : null,
      reorderLevel: v.reorderLevel ?? null,
      currentStock,
      product: {
        id: v.product.id,
        name: v.product.name,
        code: v.product.code,
        description: v.product.description,
        unit: v.product.unit,
        categoryId: v.product.categoryId,
        category: v.product.category
          ? {
              id: v.product.category.id,
              name: v.product.category.name,
              code: v.product.category.code,
              color: v.product.category.color,
              createdAt: v.product.category.createdAt.toISOString(),
              updatedAt: v.product.category.updatedAt.toISOString(),
            }
          : null,
        variantCount: v.product._count.variants,
        createdAt: v.product.createdAt.toISOString(),
        updatedAt: v.product.updatedAt.toISOString(),
      },
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    };
  }

  private async computeStocks(variantIds: string[]): Promise<Map<string, number>> {
    if (variantIds.length === 0) return new Map();

    const rows = await this.prisma.stockMovement.groupBy({
      by: ['variantId', 'type'],
      where: { variantId: { in: variantIds } },
      _sum: { quantity: true },
    });

    const totals = new Map<string, number>();
    for (const id of variantIds) totals.set(id, 0);

    for (const r of rows) {
      const sum = Number(r._sum.quantity ?? 0);
      const sign = r.type === 'OUT' ? -1 : 1;
      totals.set(r.variantId, (totals.get(r.variantId) ?? 0) + sign * sum);
    }
    return totals;
  }
}

/** Каноническая форма JSON-объекта: ключи отсортированы, значения trim'ы. */
function canonicalize(obj: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) {
    const v = obj[k];
    sorted[k] = typeof v === 'string' ? v.trim() : v;
  }
  return sorted;
}
