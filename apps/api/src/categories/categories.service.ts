import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateCategoryInput,
  PaginationQuery,
  UpdateCategoryInput,
} from '@art-garage/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: PaginationQuery & { includeDeleted?: boolean }) {
    const where: Prisma.CategoryWhereInput = {
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { products: { where: { deletedAt: null } } } },
        },
      }),
      this.prisma.category.count({ where }),
    ]);

    return {
      items: items.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        color: c.color,
        nextProductSeq: c.nextProductSeq,
        productCount: c._count.products,
        deletedAt: c.deletedAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findOne(id: string) {
    const c = await this.prisma.category.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Category not found');
    return c;
  }

  async create(input: CreateCategoryInput, userId?: string) {
    try {
      const created = await this.prisma.category.create({
        data: {
          name: input.name,
          color: input.color ?? null,
          code: input.code ? input.code.toUpperCase() : null,
        },
      });
      await this.audit.log({
        entity: 'Category',
        entityId: created.id,
        action: 'CREATE',
        userId,
        after: created,
      });
      return created;
    } catch (err) {
      this.translateUniqueError(err);
      throw err;
    }
  }

  async update(id: string, input: UpdateCategoryInput, userId?: string) {
    const before = await this.findOne(id);
    try {
      const updated = await this.prisma.category.update({
        where: { id },
        data: {
          ...input,
          ...(input.code !== undefined ? { code: input.code ? input.code.toUpperCase() : null } : {}),
        },
      });
      await this.audit.log({
        entity: 'Category',
        entityId: id,
        action: 'UPDATE',
        userId,
        before,
        after: updated,
      });
      return updated;
    } catch (err) {
      this.translateUniqueError(err);
      throw err;
    }
  }

  async remove(id: string, userId?: string) {
    const cat = await this.findOne(id);
    if (cat.deletedAt) return;
    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      entity: 'Category',
      entityId: id,
      action: 'DELETE',
      userId,
      before: cat,
    });
  }

  async restore(id: string, userId?: string) {
    const before = await this.findOne(id);
    const restored = await this.prisma.category.update({
      where: { id },
      data: { deletedAt: null },
    });
    await this.audit.log({
      entity: 'Category',
      entityId: id,
      action: 'RESTORE',
      userId,
      before,
      after: restored,
    });
    return restored;
  }

  private translateUniqueError(err: unknown): never | void {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? '';
      if (target.includes('code')) {
        throw new ConflictException('Категория с таким кодом уже существует');
      }
      throw new ConflictException('Категория с таким названием уже существует');
    }
  }
}
