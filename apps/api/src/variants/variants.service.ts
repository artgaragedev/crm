import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  buildVariantSku,
  type CreateProductWithMatrixInput,
  type CreateProductWithVariantInput,
  type CreateVariantInput,
  type ExtendProductWithMatrixInput,
  type PaginationQuery,
  type UpdateVariantInput,
  type VariantAttributeValueRef,
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
    attributeValues: {
      include: {
        attribute: true;
        attributeValue: true;
      };
    };
  };
}>;

const variantInclude = {
  product: {
    include: {
      category: true,
      _count: { select: { variants: true } },
    },
  },
  attributeValues: {
    include: {
      attribute: true,
      attributeValue: true,
    },
  },
} satisfies Prisma.ProductVariantInclude;

/**
 * Хранение вариативности — двойная запись:
 *   1) реляционно: VariantAttributeValue (variantId, attributeId, attributeValueId)
 *      — источник правды, гарантирует целостность через FK + uniq (variantId, attributeId)
 *   2) денорм: ProductVariant.attributes JSON ({ "COLOR": "RED", "SIZE": "M" })
 *      — кэш для быстрого чтения и обратной совместимости со старым UI
 *
 * При любой записи: создаём/обновляем обе стороны в одной транзакции.
 * При чтении: отдаём оба варианта (UI выбирает).
 */
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
        include: variantInclude,
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
      include: variantInclude,
    });
    if (!variant) throw new NotFoundException('Variant not found');
    const stocks = await this.computeStocks([id]);
    return this.serialize(variant, stocks.get(id) ?? 0);
  }

  async create(input: CreateVariantInput, userId?: string) {
    await this.assertProductExists(input.productId);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const resolved = await this.resolveAttributes(tx, input);
        await this.assertNoDuplicateCombination(tx, input.productId, resolved.refs);
        await this.syncProductAttributes(tx, input.productId, resolved.refs);

        let sku = input.sku?.trim();
        if (!sku) {
          const product = await this.ensureProductCode(tx, input.productId);
          sku = await this.makeUniqueVariantSku(tx, product.code!, resolved.refs);
        }

        const created = await tx.productVariant.create({
          data: {
            productId: input.productId,
            sku,
            attributes: resolved.snapshot,
            price: input.price ?? null,
            reorderLevel: input.reorderLevel ?? null,
            attributeValues: {
              create: resolved.refs.map((r) => ({
                attributeId: r.attributeId,
                attributeValueId: r.attributeValueId,
              })),
            },
          },
          include: variantInclude,
        });
        return this.serialize(created, 0);
      });

      await this.audit.log({
        entity: 'Variant',
        entityId: result.id,
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

    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
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

          const resolved = await this.resolveAttributes(tx, {
            attributeValues: input.variant.attributeValues,
            attributes: input.variant.attributes,
          });
          await this.syncProductAttributes(tx, product.id, resolved.refs);

          const sku =
            input.variant.sku?.trim() ||
            (await this.makeUniqueVariantSku(tx, code, resolved.refs));

          const variant = await tx.productVariant.create({
            data: {
              productId: product.id,
              sku,
              attributes: resolved.snapshot,
              price: input.variant.price ?? null,
              reorderLevel: input.variant.reorderLevel ?? null,
              attributeValues: {
                create: resolved.refs.map((r) => ({
                  attributeId: r.attributeId,
                  attributeValueId: r.attributeValueId,
                })),
              },
            },
            include: variantInclude,
          });

          return { variant: this.serialize(variant, 0), productId: product.id };
        },
        { maxWait: 10_000, timeout: 30_000 },
      );

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

  /**
   * Создание вариативного товара матрицей: Product + ProductAttribute[] + N вариантов
   * в одной транзакции. Все варианты валидируются: каждый должен покрывать ровно набор axes.
   */
  async createProductWithMatrix(
    input: CreateProductWithMatrixInput,
    userId?: string,
  ) {
    if (input.product.categoryId) {
      await this.assertCategoryExists(input.product.categoryId);
    }

    // Проверка: каждое axes.attributeId должно существовать; собираем подсказку в Map.
    const axisIds = input.axes.map((a) => a.attributeId);
    const attrs = await this.prisma.attribute.findMany({
      where: { id: { in: axisIds }, deletedAt: null },
    });
    if (attrs.length !== axisIds.length) {
      throw new BadRequestException('Один или несколько атрибутов не найдены');
    }
    const axisIdSet = new Set(axisIds);

    // Проверка вариантов: каждый покрывает ровно набор axes, без лишних или недостающих.
    for (const [i, v] of input.variants.entries()) {
      const seen = new Set<string>();
      for (const ref of v.values) {
        if (!axisIdSet.has(ref.attributeId)) {
          throw new BadRequestException(
            `Вариант #${i + 1}: значение по неизвестной оси ${ref.attributeId}`,
          );
        }
        if (seen.has(ref.attributeId)) {
          throw new BadRequestException(
            `Вариант #${i + 1}: дубль оси ${ref.attributeId}`,
          );
        }
        seen.add(ref.attributeId);
      }
      if (seen.size !== axisIdSet.size) {
        throw new BadRequestException(
          `Вариант #${i + 1}: должен покрыть все ${axisIdSet.size} осей, покрыто ${seen.size}`,
        );
      }
    }

    // Проверка уникальности комбинаций внутри матрицы.
    const combos = new Set<string>();
    for (const [i, v] of input.variants.entries()) {
      const key = canonicalCombination(v.values);
      if (combos.has(key)) {
        throw new BadRequestException(`Вариант #${i + 1}: дубль комбинации в матрице`);
      }
      combos.add(key);
    }

    // Pre-check: unique-конфликт на Product.name. Soft-deleted товары тоже удерживают имя,
    // поэтому нужно явно сообщать, что имя занято удалённым товаром — иначе юзер не поймёт.
    const existingByName = await this.prisma.product.findFirst({
      where: { name: input.product.name },
      select: { code: true, deletedAt: true },
    });
    if (existingByName) {
      if (existingByName.deletedAt) {
        throw new BadRequestException(
          `Имя "${input.product.name}" занято удалённым товаром (артикул ${existingByName.code ?? '—'}). Восстанови его или используй другое имя.`,
        );
      }
      throw new BadRequestException(
        `Товар с именем "${input.product.name}" уже существует (артикул ${existingByName.code ?? '—'}).`,
      );
    }

    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
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

          await tx.productAttribute.createMany({
            data: input.axes.map((axis) => ({
              productId: product.id,
              attributeId: axis.attributeId,
              position: axis.position,
            })),
          });

          // Создаём варианты по порядку axes (это и порядок частей SKU).
          const sortedAxes = [...input.axes].sort((a, b) => a.position - b.position);
          const createdIds: string[] = [];
          for (const v of input.variants) {
            const resolved = await this.resolveAttributes(tx, {
              attributeValues: v.values,
            });
            const orderedRefs = sortedAxes
              .map((ax) => resolved.refs.find((r) => r.attributeId === ax.attributeId)!)
              .filter(Boolean);
            const sku =
              v.sku?.trim() ||
              (await this.makeUniqueVariantSku(tx, code, orderedRefs));

            const orderedSnapshot: Prisma.JsonObject = {};
            for (const r of orderedRefs) orderedSnapshot[r.attributeCode] = r.valueCode;

            const created = await tx.productVariant.create({
              data: {
                productId: product.id,
                sku,
                attributes: orderedSnapshot,
                price: v.price ?? null,
                reorderLevel: v.reorderLevel ?? null,
                attributeValues: {
                  create: orderedRefs.map((r) => ({
                    attributeId: r.attributeId,
                    attributeValueId: r.attributeValueId,
                  })),
                },
              },
              select: { id: true },
            });
            createdIds.push(created.id);
          }

          return { productId: product.id, variantIds: createdIds };
        },
        { maxWait: 10_000, timeout: 60_000 },
      );

      const variants = await this.prisma.productVariant.findMany({
        where: { id: { in: result.variantIds } },
        include: variantInclude,
      });
      const variantsById = new Map(variants.map((v) => [v.id, v]));
      const orderedVariants = result.variantIds
        .map((id) => variantsById.get(id))
        .filter((v): v is VariantRow => Boolean(v));

      await this.audit.log({
        entity: 'Product',
        entityId: result.productId,
        action: 'CREATE',
        userId,
        note: `Создан вариативный товар с ${orderedVariants.length} вариантами`,
      });
      for (const v of orderedVariants) {
        await this.audit.log({
          entity: 'Variant',
          entityId: v.id,
          action: 'CREATE',
          userId,
        });
      }

      const stocks = await this.computeStocks(orderedVariants.map((v) => v.id));
      return {
        productId: result.productId,
        variants: orderedVariants.map((v) => this.serialize(v, stocks.get(v.id) ?? 0)),
      };
    } catch (err) {
      this.translatePrismaError(err);
      throw err;
    }
  }

  /**
   * Расширение существующего вариативного товара матрицей: добавляет недостающие оси (ProductAttribute)
   * и новые вариации в одной транзакции. Существующие оси/вариации не трогаются.
   *
   * Контракт:
   *   - input.axes — полный набор осей после операции. Убрать существующую ось нельзя.
   *   - input.variants — только НОВЫЕ варианты; pre-check падает, если комбинация уже есть у товара.
   */
  async extendProductWithMatrix(
    input: ExtendProductWithMatrixInput,
    userId?: string,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: input.productId },
      select: {
        id: true,
        name: true,
        deletedAt: true,
        attributes: {
          select: {
            attributeId: true,
            position: true,
            attribute: { select: { name: true } },
          },
        },
      },
    });
    if (!product) throw new BadRequestException('Товар не найден');
    if (product.deletedAt) throw new BadRequestException('Нельзя расширять удалённый товар');

    // Все axes из input.axes должны существовать в справочнике.
    const inputAxisIds = input.axes.map((a) => a.attributeId);
    const attrs = await this.prisma.attribute.findMany({
      where: { id: { in: inputAxisIds }, deletedAt: null },
    });
    if (attrs.length !== inputAxisIds.length) {
      throw new BadRequestException('Один или несколько атрибутов не найдены');
    }

    // Запрещаем убирать существующую ось — у товара по ней есть варианты.
    const inputAxisIdSet = new Set(inputAxisIds);
    for (const existing of product.attributes) {
      if (!inputAxisIdSet.has(existing.attributeId)) {
        throw new BadRequestException(
          `Нельзя убрать ось "${existing.attribute.name}" — у товара уже есть вариации по ней`,
        );
      }
    }

    // Каждый variant покрывает ровно набор axes.
    for (const [i, v] of input.variants.entries()) {
      const seen = new Set<string>();
      for (const ref of v.values) {
        if (!inputAxisIdSet.has(ref.attributeId)) {
          throw new BadRequestException(
            `Вариант #${i + 1}: значение по неизвестной оси ${ref.attributeId}`,
          );
        }
        if (seen.has(ref.attributeId)) {
          throw new BadRequestException(`Вариант #${i + 1}: дубль оси ${ref.attributeId}`);
        }
        seen.add(ref.attributeId);
      }
      if (seen.size !== inputAxisIdSet.size) {
        throw new BadRequestException(
          `Вариант #${i + 1}: должен покрыть все ${inputAxisIdSet.size} осей, покрыто ${seen.size}`,
        );
      }
    }

    // Уникальность внутри input.variants.
    const combosLocal = new Set<string>();
    for (const [i, v] of input.variants.entries()) {
      const key = canonicalCombination(v.values);
      if (combosLocal.has(key)) {
        throw new BadRequestException(`Вариант #${i + 1}: дубль комбинации в матрице`);
      }
      combosLocal.add(key);
    }

    // Pre-check: ни одна новая комбинация не должна совпадать с существующими у товара.
    // Это быстрый отказ с понятным сообщением; tx ниже всё равно повторно проверит через assertNoDuplicateCombination.
    const existingVariants = await this.prisma.productVariant.findMany({
      where: { productId: input.productId },
      select: {
        attributeValues: { select: { attributeId: true, attributeValueId: true } },
      },
    });
    const existingCombos = new Set(
      existingVariants.map((v) => canonicalCombination(v.attributeValues)),
    );
    for (const [i, v] of input.variants.entries()) {
      if (existingCombos.has(canonicalCombination(v.values))) {
        throw new BadRequestException(
          `Вариант #${i + 1}: такая комбинация значений уже существует у этого товара`,
        );
      }
    }

    try {
      const result = await this.prisma.$transaction(
        async (tx) => {
          // Гарантируем что у товара есть code (нужен для SKU).
          const productWithCode = await this.ensureProductCode(tx, input.productId);

          // Добавляем недостающие оси. Existing positions не трогаем — это сломало бы SKU существующих вариантов.
          const existingAxisIds = new Set(product.attributes.map((a) => a.attributeId));
          const maxExistingPos = product.attributes.reduce(
            (m, a) => Math.max(m, a.position),
            -1,
          );
          let nextPos = maxExistingPos + 1;
          for (const ax of input.axes) {
            if (existingAxisIds.has(ax.attributeId)) continue;
            await tx.productAttribute.create({
              data: {
                productId: input.productId,
                attributeId: ax.attributeId,
                position: Math.max(ax.position, nextPos),
              },
            });
            nextPos = Math.max(nextPos, ax.position) + 1;
          }

          const sortedAxes = [...input.axes].sort((a, b) => a.position - b.position);
          const createdIds: string[] = [];

          for (const v of input.variants) {
            const resolved = await this.resolveAttributes(tx, {
              attributeValues: v.values,
            });
            // Финальная проверка: пересечения с существующими + уже созданными в этой tx.
            await this.assertNoDuplicateCombination(tx, input.productId, resolved.refs);

            const orderedRefs = sortedAxes
              .map((ax) => resolved.refs.find((r) => r.attributeId === ax.attributeId)!)
              .filter(Boolean);
            const sku =
              v.sku?.trim() ||
              (await this.makeUniqueVariantSku(tx, productWithCode.code!, orderedRefs));

            const orderedSnapshot: Prisma.JsonObject = {};
            for (const r of orderedRefs) orderedSnapshot[r.attributeCode] = r.valueCode;

            const created = await tx.productVariant.create({
              data: {
                productId: input.productId,
                sku,
                attributes: orderedSnapshot,
                price: v.price ?? null,
                reorderLevel: v.reorderLevel ?? null,
                attributeValues: {
                  create: orderedRefs.map((r) => ({
                    attributeId: r.attributeId,
                    attributeValueId: r.attributeValueId,
                  })),
                },
              },
              select: { id: true },
            });
            createdIds.push(created.id);
          }

          return { productId: input.productId, variantIds: createdIds };
        },
        { maxWait: 10_000, timeout: 60_000 },
      );

      const variants = await this.prisma.productVariant.findMany({
        where: { id: { in: result.variantIds } },
        include: variantInclude,
      });
      const variantsById = new Map(variants.map((v) => [v.id, v]));
      const orderedVariants = result.variantIds
        .map((id) => variantsById.get(id))
        .filter((v): v is VariantRow => Boolean(v));

      await this.audit.log({
        entity: 'Product',
        entityId: result.productId,
        action: 'UPDATE',
        userId,
        note: `Расширена матрица: +${orderedVariants.length} вариаций`,
      });
      for (const v of orderedVariants) {
        await this.audit.log({
          entity: 'Variant',
          entityId: v.id,
          action: 'CREATE',
          userId,
        });
      }

      const stocks = await this.computeStocks(orderedVariants.map((v) => v.id));
      return {
        productId: result.productId,
        variants: orderedVariants.map((v) => this.serialize(v, stocks.get(v.id) ?? 0)),
      };
    } catch (err) {
      this.translatePrismaError(err);
      throw err;
    }
  }

  async update(id: string, input: UpdateVariantInput, userId?: string) {
    const before = await this.findOne(id);

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        // Если клиент прислал хоть что-то, относящееся к атрибутам — пересинхронизируем обе стороны.
        const wantsAttrChange =
          input.attributeValues !== undefined || input.attributes !== undefined;

        let snapshot: Prisma.JsonObject | undefined;
        if (wantsAttrChange) {
          const resolved = await this.resolveAttributes(tx, {
            attributeValues: input.attributeValues,
            attributes: input.attributes,
          });
          await this.assertNoDuplicateCombination(
            tx,
            before.productId,
            resolved.refs,
            id,
          );
          await this.syncProductAttributes(tx, before.productId, resolved.refs);

          // Перезаписываем связи: удаляем старые и пишем новые.
          await tx.variantAttributeValue.deleteMany({ where: { variantId: id } });
          if (resolved.refs.length > 0) {
            await tx.variantAttributeValue.createMany({
              data: resolved.refs.map((r) => ({
                variantId: id,
                attributeId: r.attributeId,
                attributeValueId: r.attributeValueId,
              })),
            });
          }
          snapshot = resolved.snapshot;
        }

        return tx.productVariant.update({
          where: { id },
          data: {
            sku: input.sku,
            attributes: snapshot,
            price: input.price,
            reorderLevel: input.reorderLevel,
          },
          include: variantInclude,
        });
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

  // ── helpers (внутренние; используются и из products-matrix) ─────────────

  /**
   * Гарантирует что у товара есть code. Если нет — атомарно выделяет seq из категории и проставляет.
   */
  async ensureProductCode(tx: Prisma.TransactionClient, productId: string) {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, code: true, categoryId: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.code) return product;
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
  }

  /**
   * Резолвит набор значений атрибутов из любого из двух источников:
   *   1) input.attributeValues — реляционные refs (предпочтительно)
   *   2) input.attributes      — legacy JSON ({ "COLOR": "RED" }) — резолвится через справочник по коду
   *
   * Возвращает массив { attributeId, attributeValueId, attributeCode, valueCode }
   * + JSON-снапшот в денорм-формате для ProductVariant.attributes.
   */
  async resolveAttributes(
    tx: Prisma.TransactionClient,
    input: {
      attributeValues?: ReadonlyArray<VariantAttributeValueRef>;
      attributes?: VariantAttributes;
    },
  ): Promise<{
    refs: Array<{
      attributeId: string;
      attributeValueId: string;
      attributeCode: string;
      valueCode: string;
    }>;
    snapshot: Prisma.JsonObject;
  }> {
    const refs: Array<{
      attributeId: string;
      attributeValueId: string;
      attributeCode: string;
      valueCode: string;
    }> = [];

    if (input.attributeValues && input.attributeValues.length > 0) {
      // Реляционный путь: подгружаем атрибуты и значения, проверяем что они согласованы.
      const valueIds = input.attributeValues.map((r) => r.attributeValueId);
      const values = await tx.attributeValue.findMany({
        where: { id: { in: valueIds }, deletedAt: null },
        include: { attribute: true },
      });
      const byId = new Map(values.map((v) => [v.id, v]));
      for (const ref of input.attributeValues) {
        const v = byId.get(ref.attributeValueId);
        if (!v) {
          throw new BadRequestException(
            `Значение атрибута не найдено: ${ref.attributeValueId}`,
          );
        }
        if (v.attributeId !== ref.attributeId) {
          throw new BadRequestException(
            `Значение ${v.value} не принадлежит атрибуту ${ref.attributeId}`,
          );
        }
        refs.push({
          attributeId: v.attributeId,
          attributeValueId: v.id,
          attributeCode: v.attribute.code,
          valueCode: v.code ?? v.value.toUpperCase(),
        });
      }
    } else if (input.attributes && Object.keys(input.attributes).length > 0) {
      // Legacy путь: { "COLOR": "RED" } → лукапим через справочник по code.
      // Если значения нет в справочнике — auto-create (мягкое поведение для legacy импорта).
      for (const [rawKey, rawValue] of Object.entries(input.attributes)) {
        const value = typeof rawValue === 'string' ? rawValue.trim() : '';
        if (!value) continue;
        const attrCode = rawKey.trim().toUpperCase();
        const attribute = await tx.attribute.findUnique({
          where: { code: attrCode },
        });
        if (!attribute) {
          throw new BadRequestException(
            `Неизвестный атрибут "${attrCode}". Создайте его в справочнике или передайте attributeValues.`,
          );
        }
        const valueUpper = value.toUpperCase();
        let av = await tx.attributeValue.findUnique({
          where: { attributeId_value: { attributeId: attribute.id, value: valueUpper } },
        });
        if (!av) {
          // Auto-create значения — только для legacy JSON-пути.
          av = await tx.attributeValue.create({
            data: {
              attributeId: attribute.id,
              value: valueUpper,
              code: valueUpper.replace(/[^A-Z0-9]+/gu, '_').slice(0, 16) || 'X',
            },
          });
        }
        refs.push({
          attributeId: attribute.id,
          attributeValueId: av.id,
          attributeCode: attribute.code,
          valueCode: av.code ?? av.value,
        });
      }
    }

    // Дубль оси — защита (хотя zod уже проверил для attributeValues).
    const seenAxis = new Set<string>();
    for (const r of refs) {
      if (seenAxis.has(r.attributeId)) {
        throw new BadRequestException('У вариации не может быть двух значений по одной оси');
      }
      seenAxis.add(r.attributeId);
    }

    const snapshot: Prisma.JsonObject = {};
    for (const r of refs) snapshot[r.attributeCode] = r.valueCode;

    return { refs, snapshot };
  }

  /**
   * Не даём создать вторую вариацию того же товара с идентичным набором (attributeId → valueId).
   * Сравнение по канонической форме (отсортированные пары).
   */
  async assertNoDuplicateCombination(
    tx: Prisma.TransactionClient,
    productId: string,
    refs: Array<{ attributeId: string; attributeValueId: string }>,
    excludeVariantId?: string,
  ) {
    const target = canonicalCombination(refs);
    const siblings = await tx.productVariant.findMany({
      where: {
        productId,
        ...(excludeVariantId ? { NOT: { id: excludeVariantId } } : {}),
      },
      select: {
        id: true,
        attributeValues: {
          select: { attributeId: true, attributeValueId: true },
        },
      },
    });
    const conflict = siblings.find(
      (v) => canonicalCombination(v.attributeValues) === target,
    );
    if (conflict) {
      throw new BadRequestException(
        'У этого товара уже есть вариация с такой же комбинацией значений',
      );
    }
  }

  /**
   * Гарантирует что все упомянутые в вариантах атрибуты привязаны к товару через ProductAttribute.
   * Position назначается по порядку первого появления.
   */
  async syncProductAttributes(
    tx: Prisma.TransactionClient,
    productId: string,
    refs: Array<{ attributeId: string }>,
  ) {
    if (refs.length === 0) return;
    const existing = await tx.productAttribute.findMany({
      where: { productId },
      select: { attributeId: true, position: true },
    });
    const existingIds = new Set(existing.map((e) => e.attributeId));
    let nextPosition =
      existing.reduce((m, e) => Math.max(m, e.position), -1) + 1;

    for (const r of refs) {
      if (existingIds.has(r.attributeId)) continue;
      await tx.productAttribute.create({
        data: {
          productId,
          attributeId: r.attributeId,
          position: nextPosition++,
        },
      });
      existingIds.add(r.attributeId);
    }
  }

  /**
   * SKU вариации = product.code + хвосты из value.code по порядку refs.
   * При коллизии (теоретически возможной если значение переименовали и совпало с другим SKU) —
   * добавляем числовой суффикс.
   */
  async makeUniqueVariantSku(
    tx: Prisma.TransactionClient,
    productCode: string,
    refs: ReadonlyArray<{ valueCode: string }>,
  ): Promise<string> {
    const candidate = buildVariantSku(productCode, refs.map((r) => r.valueCode));
    let result = candidate;
    let i = 1;
    while (true) {
      const exists = await tx.productVariant.findUnique({
        where: { sku: result },
        select: { id: true },
      });
      if (!exists) return result;
      i++;
      result = `${candidate}-${i}`;
      if (i > 100) return `${candidate}-${Date.now()}`;
    }
  }

  private async assertProductExists(productId: string) {
    const exists = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!exists) throw new BadRequestException('Product not found');
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
      attributeValues: v.attributeValues.map((av) => ({
        attributeId: av.attributeId,
        attributeValueId: av.attributeValueId,
        attribute: {
          id: av.attribute.id,
          name: av.attribute.name,
          code: av.attribute.code,
          type: av.attribute.type,
          unit: av.attribute.unit,
          sortOrder: av.attribute.sortOrder,
          deletedAt: av.attribute.deletedAt?.toISOString() ?? null,
          createdAt: av.attribute.createdAt.toISOString(),
          updatedAt: av.attribute.updatedAt.toISOString(),
        },
        value: {
          id: av.attributeValue.id,
          attributeId: av.attributeValue.attributeId,
          value: av.attributeValue.value,
          label: av.attributeValue.label,
          code: av.attributeValue.code,
          swatch: av.attributeValue.swatch,
          sortOrder: av.attributeValue.sortOrder,
          deletedAt: av.attributeValue.deletedAt?.toISOString() ?? null,
          createdAt: av.attributeValue.createdAt.toISOString(),
          updatedAt: av.attributeValue.updatedAt.toISOString(),
        },
      })),
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

/** Каноническая форма комбинации значений: "attrA=valA|attrB=valB" с отсортированными парами. */
function canonicalCombination(
  refs: ReadonlyArray<{ attributeId: string; attributeValueId: string }>,
): string {
  return refs
    .slice()
    .sort((a, b) => a.attributeId.localeCompare(b.attributeId))
    .map((r) => `${r.attributeId}=${r.attributeValueId}`)
    .join('|');
}
