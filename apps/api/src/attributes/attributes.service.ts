import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type CreateAttributeInput,
  type CreateAttributeValueInput,
  type PaginationQuery,
  type UpdateAttributeInput,
  type UpdateAttributeValueInput,
} from '@art-garage/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

type AttributeRow = Prisma.AttributeGetPayload<{
  include: {
    values: true;
    _count: { select: { productAttributes: true } };
  };
}>;

type AttributeValueRow = Prisma.AttributeValueGetPayload<Record<string, never>>;

/**
 * Справочник атрибутов вариативности.
 *
 * Инварианты:
 * - Attribute.code и Attribute.name — глобально уникальны (UPPER для code).
 * - AttributeValue.code и AttributeValue.value — уникальны в рамках атрибута.
 * - Удаление Attribute допустимо только если он не используется в товарах (P2003).
 * - Удаление AttributeValue допустимо только если он не используется в вариантах.
 */
@Injectable()
export class AttributesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Attribute CRUD ──────────────────────────────────────────────────────

  async list(query: PaginationQuery & { includeDeleted?: boolean }) {
    const where: Prisma.AttributeWhereInput = {
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.attribute.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          values: {
            where: { deletedAt: null },
            orderBy: [{ sortOrder: 'asc' }, { value: 'asc' }],
          },
          _count: { select: { productAttributes: true } },
        },
      }),
      this.prisma.attribute.count({ where }),
    ]);

    return {
      items: items.map((a) => this.serializeAttribute(a)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findOne(id: string) {
    const a = await this.prisma.attribute.findUnique({
      where: { id },
      include: {
        values: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { value: 'asc' }],
        },
        _count: { select: { productAttributes: true } },
      },
    });
    if (!a) throw new NotFoundException('Attribute not found');
    return this.serializeAttribute(a);
  }

  async create(input: CreateAttributeInput, userId?: string) {
    try {
      const created = await this.prisma.attribute.create({
        data: {
          name: input.name,
          code: input.code.toUpperCase(),
          type: input.type ?? 'TEXT',
          unit: input.unit ?? null,
          sortOrder: input.sortOrder ?? 0,
        },
        include: {
          values: true,
          _count: { select: { productAttributes: true } },
        },
      });
      const result = this.serializeAttribute(created);
      await this.audit.log({
        entity: 'Attribute',
        entityId: created.id,
        action: 'CREATE',
        userId,
        after: result,
      });
      return result;
    } catch (err) {
      this.translateAttributeUnique(err);
      throw err;
    }
  }

  async update(id: string, input: UpdateAttributeInput, userId?: string) {
    const before = await this.findOne(id);
    try {
      const updated = await this.prisma.attribute.update({
        where: { id },
        data: {
          name: input.name,
          code: input.code ? input.code.toUpperCase() : undefined,
          type: input.type,
          unit: input.unit,
          sortOrder: input.sortOrder,
        },
        include: {
          values: { where: { deletedAt: null }, orderBy: [{ sortOrder: 'asc' }, { value: 'asc' }] },
          _count: { select: { productAttributes: true } },
        },
      });
      const result = this.serializeAttribute(updated);
      await this.audit.log({
        entity: 'Attribute',
        entityId: id,
        action: 'UPDATE',
        userId,
        before,
        after: result,
      });
      return result;
    } catch (err) {
      this.translateAttributeUnique(err);
      throw err;
    }
  }

  /** Soft delete. Если атрибут используется в товарах — отказываем сразу с понятным сообщением. */
  async remove(id: string, userId?: string) {
    const a = await this.prisma.attribute.findUnique({
      where: { id },
      include: { _count: { select: { productAttributes: true, variantValues: true } } },
    });
    if (!a) throw new NotFoundException('Attribute not found');
    if (a.deletedAt) return;
    if (a._count.productAttributes > 0 || a._count.variantValues > 0) {
      throw new BadRequestException(
        'Нельзя удалить атрибут: он используется в товарах или вариантах',
      );
    }
    await this.prisma.attribute.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      entity: 'Attribute',
      entityId: id,
      action: 'DELETE',
      userId,
      before: a,
    });
  }

  async restore(id: string, userId?: string) {
    const before = await this.prisma.attribute.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Attribute not found');
    const restored = await this.prisma.attribute.update({
      where: { id },
      data: { deletedAt: null },
    });
    await this.audit.log({
      entity: 'Attribute',
      entityId: id,
      action: 'RESTORE',
      userId,
      before,
      after: restored,
    });
    return this.findOne(id);
  }

  // ── AttributeValue CRUD ─────────────────────────────────────────────────

  async createValue(
    attributeId: string,
    input: CreateAttributeValueInput,
    userId?: string,
  ) {
    await this.assertAttributeExists(attributeId);
    const value = input.value.trim();
    const code = (input.code ?? this.deriveValueCode(value)).toUpperCase();
    try {
      const created = await this.prisma.attributeValue.create({
        data: {
          attributeId,
          value,
          label: input.label ?? null,
          code,
          swatch: input.swatch ?? null,
          sortOrder: input.sortOrder ?? 0,
        },
      });
      const result = this.serializeValue(created);
      await this.audit.log({
        entity: 'AttributeValue',
        entityId: created.id,
        action: 'CREATE',
        userId,
        after: result,
      });
      return result;
    } catch (err) {
      this.translateValueUnique(err);
      throw err;
    }
  }

  async updateValue(id: string, input: UpdateAttributeValueInput, userId?: string) {
    const before = await this.prisma.attributeValue.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('AttributeValue not found');
    try {
      const updated = await this.prisma.attributeValue.update({
        where: { id },
        data: {
          value: input.value,
          label: input.label,
          code: input.code ? input.code.toUpperCase() : undefined,
          swatch: input.swatch,
          sortOrder: input.sortOrder,
        },
      });
      const result = this.serializeValue(updated);
      await this.audit.log({
        entity: 'AttributeValue',
        entityId: id,
        action: 'UPDATE',
        userId,
        before: this.serializeValue(before),
        after: result,
      });
      return result;
    } catch (err) {
      this.translateValueUnique(err);
      throw err;
    }
  }

  /** Soft delete значения. Если оно используется в вариантах — отказываем. */
  async removeValue(id: string, userId?: string) {
    const v = await this.prisma.attributeValue.findUnique({
      where: { id },
      include: { _count: { select: { variantValues: true } } },
    });
    if (!v) throw new NotFoundException('AttributeValue not found');
    if (v.deletedAt) return;
    if (v._count.variantValues > 0) {
      throw new BadRequestException(
        'Нельзя удалить значение: оно используется в вариантах товаров',
      );
    }
    await this.prisma.attributeValue.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.log({
      entity: 'AttributeValue',
      entityId: id,
      action: 'DELETE',
      userId,
      before: this.serializeValue(v),
    });
  }

  // ── helpers ─────────────────────────────────────────────────────────────

  private async assertAttributeExists(attributeId: string) {
    const exists = await this.prisma.attribute.findUnique({
      where: { id: attributeId },
      select: { id: true },
    });
    if (!exists) throw new BadRequestException('Attribute not found');
  }

  /** Превращает value в дефолтный code: UPPER, [^A-Z0-9]→'_', колапс повторов '_', обрезка. */
  private deriveValueCode(value: string): string {
    return (
      value
        .toUpperCase()
        .replace(/[^A-Z0-9]+/gu, '_')
        .replace(/^_+|_+$/gu, '')
        .replace(/_+/gu, '_')
        .slice(0, 16) || 'X'
    );
  }

  private translateAttributeUnique(err: unknown): never | void {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? '';
      if (target.includes('code')) {
        throw new ConflictException('Атрибут с таким кодом уже существует');
      }
      throw new ConflictException('Атрибут с таким названием уже существует');
    }
  }

  private translateValueUnique(err: unknown): never | void {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? '';
      if (target.includes('code')) {
        throw new ConflictException('Значение с таким кодом уже существует у этого атрибута');
      }
      throw new ConflictException(
        'Значение с таким value уже существует у этого атрибута',
      );
    }
  }

  private serializeAttribute(a: AttributeRow) {
    return {
      id: a.id,
      name: a.name,
      code: a.code,
      type: a.type,
      unit: a.unit,
      sortOrder: a.sortOrder,
      deletedAt: a.deletedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
      values: a.values.map((v) => this.serializeValue(v)),
      productCount: a._count.productAttributes,
    };
  }

  private serializeValue(v: AttributeValueRow) {
    return {
      id: v.id,
      attributeId: v.attributeId,
      value: v.value,
      label: v.label,
      code: v.code,
      swatch: v.swatch,
      sortOrder: v.sortOrder,
      deletedAt: v.deletedAt?.toISOString() ?? null,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    };
  }
}
