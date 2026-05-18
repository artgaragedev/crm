import { Injectable } from '@nestjs/common';
import { Prisma, type AuditAction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type AuditEntity =
  | 'Product'
  | 'Variant'
  | 'Category'
  | 'Lot'
  | 'Customer'
  | 'Supplier'
  | 'Attribute'
  | 'AttributeValue';

interface LogParams {
  entity: AuditEntity;
  entityId: string;
  action: AuditAction;
  userId?: string | null;
  before?: unknown;
  after?: unknown;
  note?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Записать событие в журнал. Не бросает при ошибке (audit не должен ронять основное действие).
   */
  async log(params: LogParams): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          entity: params.entity,
          entityId: params.entityId,
          action: params.action,
          userId: params.userId ?? null,
          before: this.sanitize(params.before),
          after: this.sanitize(params.after),
          note: params.note ?? null,
        },
      });
    } catch (err) {
      // Не валим основной запрос из-за аудита.
      // eslint-disable-next-line no-console
      console.error('[Audit] failed to log', err);
    }
  }

  /**
   * Batch-вариант: пишет N событий одним INSERT (createMany) вместо N последовательных коннектов.
   * Использовать при массовых операциях (matrix-flow). Не бросает.
   */
  async logMany(items: LogParams[]): Promise<void> {
    if (items.length === 0) return;
    try {
      await this.prisma.auditLog.createMany({
        data: items.map((p) => ({
          entity: p.entity,
          entityId: p.entityId,
          action: p.action,
          userId: p.userId ?? null,
          before: this.sanitize(p.before) ?? Prisma.JsonNull,
          after: this.sanitize(p.after) ?? Prisma.JsonNull,
          note: p.note ?? null,
        })),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Audit] failed to logMany', err);
    }
  }

  /**
   * История изменений сущности.
   */
  async listForEntity(entity: AuditEntity, entityId: string, limit = 100) {
    const items = await this.prisma.auditLog.findMany({
      where: { entity, entityId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
    return items.map((it) => ({
      id: it.id,
      entity: it.entity,
      entityId: it.entityId,
      action: it.action,
      before: it.before,
      after: it.after,
      note: it.note,
      user: it.user,
      createdAt: it.createdAt.toISOString(),
    }));
  }

  /** Превращаем null в Prisma.JsonNull, Date в ISO. Undefined отдаём как есть (Prisma не запишет). */
  private sanitize(
    value: unknown,
  ): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
    if (value === undefined) return undefined;
    if (value === null) return Prisma.JsonNull;
    return JSON.parse(
      JSON.stringify(value, (_k, v) => (v instanceof Date ? v.toISOString() : v)),
    ) as Prisma.InputJsonValue;
  }
}
