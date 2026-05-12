import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  buildProductCode,
  buildProductCodePrefix,
  type CreateProductInput,
  type PaginationQuery,
  type UpdateProductInput,
} from '@art-garage/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

type ProductRow = Prisma.ProductGetPayload<{
  include: {
    category: true;
    _count: { select: { variants: true } };
  };
}>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    query: PaginationQuery & { categoryId?: string; includeDeleted?: boolean },
  ) {
    const where: Prisma.ProductWhereInput = {
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { name: 'asc' },
        include: {
          category: true,
          _count: { select: { variants: true } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: items.map((p) => this.serialize(p)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        _count: { select: { variants: true } },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.serialize(product);
  }

  async create(input: CreateProductInput, userId?: string) {
    if (input.categoryId) await this.assertCategoryExists(input.categoryId);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const code = await this.allocateProductCode(tx, input.categoryId ?? null, input.name);
        return tx.product.create({
          data: {
            name: input.name,
            code,
            unit: input.unit,
            description: input.description ?? null,
            categoryId: input.categoryId ?? null,
          },
          include: { category: true, _count: { select: { variants: true } } },
        });
      });
      const result = this.serialize(created);
      await this.audit.log({
        entity: 'Product',
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

  async update(id: string, input: UpdateProductInput, userId?: string) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, unit: true },
    });
    if (!existing) throw new NotFoundException('Product not found');
    if (input.categoryId) await this.assertCategoryExists(input.categoryId);

    // Защита: не даём сменить unit, если у вариаций уже есть движения учёта.
    // Иначе ретроактивно ломается семантика всей истории (PCS → KG задним числом).
    if (input.unit !== undefined && input.unit !== existing.unit) {
      const movementsCount = await this.prisma.stockMovement.count({
        where: { variant: { productId: id } },
      });
      if (movementsCount > 0) {
        throw new BadRequestException(
          'Нельзя сменить единицу измерения: у вариаций этого товара уже есть движения учёта',
        );
      }
    }

    const before = await this.findOne(id);
    try {
      const updated = await this.prisma.product.update({
        where: { id },
        data: {
          name: input.name,
          unit: input.unit,
          description: input.description,
          categoryId: input.categoryId,
        },
        include: { category: true, _count: { select: { variants: true } } },
      });
      const result = this.serialize(updated);
      await this.audit.log({
        entity: 'Product',
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

  /** Soft delete: deletedAt. Вариации не трогаем — при restore вернутся. */
  async remove(id: string, userId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.deletedAt) return;
    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      entity: 'Product',
      entityId: id,
      action: 'DELETE',
      userId,
      before: product,
    });
  }

  async restore(id: string, userId?: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    const restored = await this.prisma.product.update({
      where: { id },
      data: { deletedAt: null },
    });
    await this.audit.log({
      entity: 'Product',
      entityId: id,
      action: 'RESTORE',
      userId,
      before: product,
      after: restored,
    });
    return restored;
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
      if (target.includes('code')) {
        throw new BadRequestException('Артикул товара коллидирует — попробуйте ещё раз');
      }
      throw new BadRequestException('Товар с таким названием уже существует');
    }
  }

  /**
   * Атомарно выделяет артикул для нового товара. Использует Category.nextProductSeq.
   * Если категории нет — генерит из имени (без sequential, fallback на name+timestamp).
   */
  async allocateProductCode(
    tx: Prisma.TransactionClient,
    categoryId: string | null,
    productName: string,
  ): Promise<string> {
    if (categoryId) {
      // Атомарный INC + read через update returning. SQL-уровень: UPDATE … RETURNING обновлённое значение.
      const cat = await tx.category.update({
        where: { id: categoryId },
        data: { nextProductSeq: { increment: 1 } },
        select: { code: true, name: true, nextProductSeq: true },
      });
      // nextProductSeq после инкремента это NEXT, а нам нужно ТЕКУЩЕЕ — то есть seq - 1.
      const seq = cat.nextProductSeq - 1;
      const prefix = buildProductCodePrefix(cat.code, cat.name || productName);
      return buildProductCode(prefix, seq);
    }
    // Без категории: префикс из имени + timestamp-based seq, чтобы избежать дублей.
    const prefix = buildProductCodePrefix(null, productName);
    // ищем сколько уже есть товаров без категории с этим префиксом — берём count + 1
    const used = await tx.product.count({
      where: { code: { startsWith: prefix }, categoryId: null },
    });
    return buildProductCode(prefix, used + 1);
  }

  private serialize(p: ProductRow) {
    return {
      id: p.id,
      name: p.name,
      code: p.code,
      description: p.description,
      unit: p.unit,
      categoryId: p.categoryId,
      category: p.category
        ? {
            id: p.category.id,
            name: p.category.name,
            code: p.category.code,
            color: p.category.color,
            createdAt: p.category.createdAt.toISOString(),
            updatedAt: p.category.updatedAt.toISOString(),
          }
        : null,
      variantCount: p._count.variants,
      deletedAt: p.deletedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
