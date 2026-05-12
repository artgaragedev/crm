import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateCustomerInput,
  PaginationQuery,
  UpdateCustomerInput,
} from '@art-garage/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

type CustomerRow = Prisma.CustomerGetPayload<Record<string, never>>;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: PaginationQuery & { includeDeleted?: boolean }) {
    const where: Prisma.CustomerWhereInput = {
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customer.count({ where }),
    ]);
    return {
      items: items.map((c) => this.serialize(c)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findOne(id: string) {
    const c = await this.prisma.customer.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Customer not found');
    return this.serialize(c);
  }

  async create(input: CreateCustomerInput, userId?: string) {
    const created = await this.prisma.customer.create({
      data: {
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        note: input.note ?? null,
        discountPercent: input.discountPercent ?? 0,
      },
    });
    await this.audit.log({
      entity: 'Customer',
      entityId: created.id,
      action: 'CREATE',
      userId,
      after: created,
    });
    return this.serialize(created);
  }

  async update(id: string, input: UpdateCustomerInput, userId?: string) {
    const before = await this.prisma.customer.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Customer not found');
    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.discountPercent !== undefined
          ? { discountPercent: input.discountPercent }
          : {}),
      },
    });
    await this.audit.log({
      entity: 'Customer',
      entityId: id,
      action: 'UPDATE',
      userId,
      before,
      after: updated,
    });
    return this.serialize(updated);
  }

  async remove(id: string, userId?: string) {
    const c = await this.prisma.customer.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Customer not found');
    if (c.deletedAt) return;
    await this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      entity: 'Customer',
      entityId: id,
      action: 'DELETE',
      userId,
      before: c,
    });
  }

  async restore(id: string, userId?: string) {
    const before = await this.prisma.customer.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Customer not found');
    const restored = await this.prisma.customer.update({
      where: { id },
      data: { deletedAt: null },
    });
    await this.audit.log({
      entity: 'Customer',
      entityId: id,
      action: 'RESTORE',
      userId,
      before,
      after: restored,
    });
    return this.serialize(restored);
  }

  /** Decimal → number и Date → ISO. Frontend ждёт number в `discountPercent`. */
  private serialize(c: CustomerRow) {
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      note: c.note,
      discountPercent: Number(c.discountPercent),
      deletedAt: c.deletedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
