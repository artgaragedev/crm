import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateSupplierInput,
  PaginationQuery,
  UpdateSupplierInput,
} from '@art-garage/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: PaginationQuery & { includeDeleted?: boolean }) {
    const where: Prisma.SupplierWhereInput = {
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.supplier.count({ where }),
    ]);
    return {
      items: items.map((s) => ({
        ...s,
        deletedAt: s.deletedAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findOne(id: string) {
    const s = await this.prisma.supplier.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Supplier not found');
    return s;
  }

  async create(input: CreateSupplierInput, userId?: string) {
    const created = await this.prisma.supplier.create({
      data: {
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        note: input.note ?? null,
      },
    });
    await this.audit.log({
      entity: 'Supplier',
      entityId: created.id,
      action: 'CREATE',
      userId,
      after: created,
    });
    return created;
  }

  async update(id: string, input: UpdateSupplierInput, userId?: string) {
    const before = await this.findOne(id);
    const updated = await this.prisma.supplier.update({ where: { id }, data: input });
    await this.audit.log({
      entity: 'Supplier',
      entityId: id,
      action: 'UPDATE',
      userId,
      before,
      after: updated,
    });
    return updated;
  }

  async remove(id: string, userId?: string) {
    const s = await this.findOne(id);
    if (s.deletedAt) return;
    await this.prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      entity: 'Supplier',
      entityId: id,
      action: 'DELETE',
      userId,
      before: s,
    });
  }

  async restore(id: string, userId?: string) {
    const before = await this.findOne(id);
    const restored = await this.prisma.supplier.update({
      where: { id },
      data: { deletedAt: null },
    });
    await this.audit.log({
      entity: 'Supplier',
      entityId: id,
      action: 'RESTORE',
      userId,
      before,
      after: restored,
    });
    return restored;
  }
}
