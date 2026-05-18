import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateMovementBatchInput,
  CreateStockMovementInput,
  LotAllocation,
  PaginationQuery,
} from '@art-garage/shared';
import { PrismaService } from '../prisma/prisma.service';

type MovementRow = Prisma.StockMovementGetPayload<{
  include: {
    variant: {
      include: {
        product: { select: { id: true; name: true; unit: true; categoryId: true } };
      };
    };
    customer: { select: { id: true; name: true } };
    supplier: { select: { id: true; name: true } };
    user: { select: { id: true; name: true; email: true } };
    consumptions: {
      include: { lot: { select: { id: true; receivedAt: true; unitCost: true } } };
    };
    reversedBy: { select: { id: true; createdAt: true } };
  };
}>;

const MOVEMENT_INCLUDE = {
  variant: {
    include: {
      product: { select: { id: true, name: true, unit: true, categoryId: true } },
    },
  },
  customer: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
  user: { select: { id: true, name: true, email: true } },
  consumptions: {
    include: { lot: { select: { id: true, receivedAt: true, unitCost: true } } },
  },
  // Если на это движение есть сторно-запись — она тут.
  reversedBy: { select: { id: true, createdAt: true } },
} satisfies Prisma.StockMovementInclude;

type Tx = Prisma.TransactionClient;

@Injectable()
export class StockMovementsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    query: PaginationQuery & { variantId?: string; type?: 'IN' | 'OUT' | 'ADJUST' },
  ) {
    const where: Prisma.StockMovementWhereInput = {
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.type ? { type: query.type } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        include: MOVEMENT_INCLUDE,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return {
      items: items.map((m) => this.serialize(m)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async create(userId: string, input: CreateStockMovementInput) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockVariants(tx, [input.variantId]);
      await this.assertCounterparties(tx, input.supplierId, input.customerId);

      const pricing = await this.resolveSalePricing(
        tx,
        input.type,
        input.customerId,
        [input.variantId],
      );

      return this.applyOne(tx, userId, {
        type: input.type,
        variantId: input.variantId,
        quantity: input.quantity,
        supplierId: input.supplierId,
        customerId: input.customerId,
        note: input.note,
        unitCost: input.unitCost,
        unitPrice: input.unitPrice,
        lotAllocations: input.lotAllocations,
        date: new Date(),
        basePrices: pricing.basePrices,
        customerDiscount: pricing.customerDiscount,
      });
    });
  }

  async createBatch(userId: string, input: CreateMovementBatchInput) {
    if (input.lines.length === 0) throw new BadRequestException('Минимум одна строка');

    const date = input.date ? new Date(input.date) : new Date();

    // Default timeout 5s — мал для батчей: applyOne делает SELECT FOR UPDATE + INSERT stockMovement
    // + N INSERT lotConsumption + N UPDATE stockLot, последовательно по каждой строке.
    // На 80+ позициях упирается в 5s (см. инцидент 2026-05-18: "Transaction already closed").
    // 60s даёт запас на ~500 строк; maxWait — сколько ждать свободный коннект в пуле.
    return this.prisma.$transaction(
      async (tx) => {
        const variantIds = Array.from(new Set(input.lines.map((l) => l.variantId)));
        await this.lockVariants(tx, variantIds);
        await this.assertCounterparties(tx, input.supplierId, input.customerId);

        // Скидку клиента и базовые цены вариантов читаем один раз на весь батч.
        const pricing = await this.resolveSalePricing(
          tx,
          input.type,
          input.customerId,
          variantIds,
        );

        const created: Awaited<ReturnType<typeof this.serialize>>[] = [];
        for (const line of input.lines) {
          const m = await this.applyOne(tx, userId, {
            type: input.type,
            variantId: line.variantId,
            quantity: line.quantity,
            supplierId: input.supplierId,
            customerId: input.customerId,
            note: input.note,
            unitCost: line.unitCost,
            unitPrice: line.unitPrice,
            lotAllocations: line.lotAllocations,
            date,
            basePrices: pricing.basePrices,
            customerDiscount: pricing.customerDiscount,
          });
          created.push(m);
        }
        return created;
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
  }

  /**
   * Сторно. Жёсткие правила целостности по lot'ам:
   * - IN/ADJUST+ можно сторнировать только если созданная партия не была потреблена.
   * - OUT/ADJUST- сторно создаёт новый lot со средневзвешенной стоимостью потреблённых партий.
   */
  async reverse(userId: string, originalId: string, note?: string) {
    return this.prisma.$transaction(async (tx) => {
      const original = await tx.stockMovement.findUnique({
        where: { id: originalId },
        include: {
          consumptions: { include: { lot: { select: { id: true, unitCost: true } } } },
          createdLot: true,
        },
      });
      if (!original) throw new NotFoundException('Movement not found');
      if (original.reversesId) {
        throw new BadRequestException('Сторно нельзя сторнировать');
      }

      const alreadyReversed = await tx.stockMovement.findUnique({
        where: { reversesId: originalId },
        select: { id: true },
      });
      if (alreadyReversed) {
        throw new BadRequestException('Это движение уже было сторнировано');
      }

      await this.lockVariants(tx, [original.variantId]);

      // Реверс прихода: lot должен быть нетронут.
      const isPositive =
        original.type === 'IN' ||
        (original.type === 'ADJUST' && Number(original.quantity) > 0);
      if (isPositive && original.createdLot) {
        const lot = original.createdLot;
        const consumed =
          Number(lot.initialQuantity) - Number(lot.remainingQuantity);
        if (consumed > 0.0001) {
          throw new BadRequestException(
            `Партия уже использована (взято ${consumed} из ${lot.initialQuantity}). ` +
              'Сначала сторнируйте связанные списания.',
          );
        }
        // Удаляем lot — каскадом не удаляется до сторно-движения, поэтому делаем сначала lot.
        await tx.stockLot.delete({ where: { id: lot.id } });

        // Создаём compensating movement.
        const reverseQty = original.type === 'ADJUST' ? -Number(original.quantity) : Number(original.quantity);
        const reverseType = original.type === 'IN' ? 'OUT' : 'ADJUST';
        const created = await tx.stockMovement.create({
          data: {
            type: reverseType,
            variantId: original.variantId,
            quantity: reverseQty,
            supplierId: null,
            customerId: null,
            userId,
            note: note?.trim() || `Сторно прихода ${original.id}`,
            reversesId: original.id,
            totalCost: 0,
          },
          include: MOVEMENT_INCLUDE,
        });
        return this.serialize(created);
      }

      // Реверс списания: создаём новый lot с avg cost потреблённых партий.
      if (!isPositive) {
        const consumptions = original.consumptions;
        if (consumptions.length === 0) {
          // legacy движение без consumption — просто возвращаем qty без cost
          const reverseQty = Math.abs(Number(original.quantity));
          const reverseType = original.type === 'OUT' ? 'IN' : 'ADJUST';
          const reverseSignedQty = original.type === 'ADJUST' ? Math.abs(Number(original.quantity)) : reverseQty;

          const created = await tx.stockMovement.create({
            data: {
              type: reverseType,
              variantId: original.variantId,
              quantity: reverseSignedQty,
              supplierId: null,
              customerId: null,
              userId,
              note: note?.trim() || `Сторно списания ${original.id}`,
              reversesId: original.id,
              totalCost: 0,
            },
            include: MOVEMENT_INCLUDE,
          });

          // Создаём компенсирующий lot (cost=0 — мы не знаем настоящую цену)
          await tx.stockLot.create({
            data: {
              variantId: original.variantId,
              unitCost: 0,
              initialQuantity: reverseSignedQty,
              remainingQuantity: reverseSignedQty,
              receivedAt: new Date(),
              userId,
              createdByMovementId: created.id,
              note: 'Сторно legacy движения без cost-tracking',
            },
          });
          return this.serialize(created);
        }

        const totalConsumed = consumptions.reduce(
          (sum, c) => sum + Number(c.quantity) * Number(c.lot.unitCost),
          0,
        );
        const totalQty = consumptions.reduce((sum, c) => sum + Number(c.quantity), 0);
        const avgCost = totalQty > 0 ? totalConsumed / totalQty : 0;

        const reverseQty = Math.abs(Number(original.quantity));
        const reverseType = original.type === 'OUT' ? 'IN' : 'ADJUST';
        const reverseSignedQty = original.type === 'ADJUST' ? reverseQty : reverseQty;
        const created = await tx.stockMovement.create({
          data: {
            type: reverseType,
            variantId: original.variantId,
            quantity: reverseSignedQty,
            supplierId: null,
            customerId: null,
            userId,
            note: note?.trim() || `Сторно списания ${original.id}`,
            reversesId: original.id,
            totalCost: totalConsumed,
          },
          include: MOVEMENT_INCLUDE,
        });
        await tx.stockLot.create({
          data: {
            variantId: original.variantId,
            unitCost: avgCost,
            initialQuantity: reverseSignedQty,
            remainingQuantity: reverseSignedQty,
            receivedAt: new Date(),
            userId,
            createdByMovementId: created.id,
            note: 'Возврат из сторно (avg cost потреблённых партий)',
          },
        });
        return this.serialize(created);
      }

      throw new BadRequestException('Не удалось определить тип сторно');
    });
  }

  async lotsForVariant(variantId: string) {
    const lots = await this.prisma.stockLot.findMany({
      where: { variantId },
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { receivedAt: 'asc' },
    });
    return lots.map((l) => ({
      id: l.id,
      variantId: l.variantId,
      unitCost: Number(l.unitCost),
      initialQuantity: Number(l.initialQuantity),
      remainingQuantity: Number(l.remainingQuantity),
      receivedAt: l.receivedAt.toISOString(),
      supplierId: l.supplierId,
      supplier: l.supplier,
      note: l.note,
      userId: l.userId,
      createdByMovementId: l.createdByMovementId,
      createdAt: l.createdAt.toISOString(),
    }));
  }

  // ---------- Internal ----------

  /** SELECT FOR UPDATE на все вариации сразу. Защищает от race на батч. */
  private async lockVariants(tx: Tx, variantIds: string[]) {
    if (variantIds.length === 0) return;
    const ids = Array.from(new Set(variantIds));
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "ProductVariant" WHERE id = ANY(${ids}::text[]) FOR UPDATE
    `;
    if (locked.length !== ids.length) {
      const lockedSet = new Set(locked.map((l) => l.id));
      const missing = ids.filter((id) => !lockedSet.has(id));
      throw new NotFoundException(`Вариации не найдены: ${missing.join(', ')}`);
    }
  }

  private async assertCounterparties(
    tx: Tx,
    supplierId?: string | null,
    customerId?: string | null,
  ) {
    if (supplierId) {
      const sup = await tx.supplier.findUnique({
        where: { id: supplierId },
        select: { id: true, deletedAt: true },
      });
      if (!sup || sup.deletedAt) throw new NotFoundException('Supplier not found');
    }
    if (customerId) {
      const cus = await tx.customer.findUnique({
        where: { id: customerId },
        select: { id: true, deletedAt: true },
      });
      if (!cus || cus.deletedAt) throw new NotFoundException('Customer not found');
    }
  }

  /**
   * Готовит данные для расчёта продажной цены: скидку клиента и базовые цены вариаций.
   * Возвращает пустые значения для IN/ADJUST+ — там цена продажи не применяется.
   */
  private async resolveSalePricing(
    tx: Tx,
    type: 'IN' | 'OUT' | 'ADJUST',
    customerId: string | undefined | null,
    variantIds: string[],
  ): Promise<{ customerDiscount: number; basePrices: Map<string, number | null> }> {
    const basePrices = new Map<string, number | null>();
    if (type === 'IN') return { customerDiscount: 0, basePrices };

    let customerDiscount = 0;
    if (customerId) {
      const c = await tx.customer.findUnique({
        where: { id: customerId },
        select: { discountPercent: true },
      });
      customerDiscount = Number(c?.discountPercent ?? 0);
    }

    const vs = await tx.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, price: true },
    });
    for (const v of vs) {
      basePrices.set(v.id, v.price === null ? null : Number(v.price));
    }
    return { customerDiscount, basePrices };
  }

  /** Применяет одно движение: создаёт lot или потребляет существующие. */
  private async applyOne(
    tx: Tx,
    userId: string,
    args: {
      type: 'IN' | 'OUT' | 'ADJUST';
      variantId: string;
      quantity: number;
      supplierId?: string | null;
      customerId?: string | null;
      note?: string | null;
      unitCost?: number;
      /** Фактическая цена продажи за единицу (для OUT/ADJUST-). Если undefined, выводится из basePrices×(1−customerDiscount). */
      unitPrice?: number;
      lotAllocations?: LotAllocation[];
      date: Date;
      /** Базовые цены вариаций (Variant.price) для авто-расчёта unitPrice. */
      basePrices?: Map<string, number | null>;
      /** Скидка клиента в % на момент сделки. */
      customerDiscount?: number;
    },
  ) {
    const isPositive =
      args.type === 'IN' || (args.type === 'ADJUST' && args.quantity > 0);
    const isNegative =
      args.type === 'OUT' || (args.type === 'ADJUST' && args.quantity < 0);

    if (isPositive) {
      // Создаём движение и сразу новый lot.
      const unitCost = args.unitCost ?? 0;
      const qty = Math.abs(args.quantity);
      const totalCost = qty * unitCost;

      const movement = await tx.stockMovement.create({
        data: {
          type: args.type,
          variantId: args.variantId,
          quantity: args.quantity,
          supplierId: args.supplierId ?? null,
          customerId: null, // у IN/ADJUST+ не должно быть клиента
          userId,
          note: args.note ?? null,
          totalCost,
          createdAt: args.date,
        },
        include: MOVEMENT_INCLUDE,
      });

      await tx.stockLot.create({
        data: {
          variantId: args.variantId,
          unitCost,
          initialQuantity: qty,
          remainingQuantity: qty,
          receivedAt: args.date,
          supplierId: args.supplierId ?? null,
          note: args.note ?? null,
          userId,
          createdByMovementId: movement.id,
        },
      });

      return this.serialize(movement);
    }

    if (isNegative) {
      const qty = Math.abs(args.quantity);

      // 1. Распределение по lot'ам: вручную или FIFO.
      const allocations = args.lotAllocations
        ? await this.validateManualAllocations(tx, args.variantId, qty, args.lotAllocations)
        : await this.computeFifoAllocations(tx, args.variantId, qty);

      const totalCost = allocations.reduce(
        (s, a) => s + a.quantity * a.unitCost,
        0,
      );

      // 1.5. Цена продажи замораживается на факте.
      // Приоритет: явный unitPrice из input → расчёт из basePrice × (1−discount/100).
      // Скидка клиента сохраняется отдельно как audit trail, независимо от того,
      // переписал ли менеджер цену вручную.
      const customerDiscount = args.customerId ? args.customerDiscount ?? 0 : 0;
      let unitPrice: number | null = args.unitPrice ?? null;
      if (unitPrice === null) {
        const base = args.basePrices?.get(args.variantId) ?? null;
        if (base !== null) {
          const computed = base * (1 - customerDiscount / 100);
          unitPrice = Math.round(computed * 100) / 100;
        }
      }
      const discountPercent =
        args.customerId && customerDiscount > 0 ? customerDiscount : null;

      // 2. Создаём движение.
      const movement = await tx.stockMovement.create({
        data: {
          type: args.type,
          variantId: args.variantId,
          quantity: args.quantity, // signed (отрицательный для ADJUST-)
          supplierId: null, // у OUT/ADJUST- не должно быть поставщика
          customerId: args.customerId ?? null,
          userId,
          note: args.note ?? null,
          totalCost,
          unitPrice,
          discountPercent,
          createdAt: args.date,
        },
        include: MOVEMENT_INCLUDE,
      });

      // 3. Регистрируем consumption и уменьшаем remaining lot'ов.
      for (const alloc of allocations) {
        await tx.lotConsumption.create({
          data: {
            lotId: alloc.lotId,
            movementId: movement.id,
            quantity: alloc.quantity,
          },
        });
        await tx.stockLot.update({
          where: { id: alloc.lotId },
          data: { remainingQuantity: { decrement: alloc.quantity } },
        });
      }

      return this.serialize(movement);
    }

    throw new BadRequestException('Количество не может быть нулевым');
  }

  /** FIFO: берём из самых старых lot'ов с remainingQuantity > 0. */
  private async computeFifoAllocations(
    tx: Tx,
    variantId: string,
    needed: number,
  ): Promise<Array<{ lotId: string; quantity: number; unitCost: number }>> {
    const lots = await tx.stockLot.findMany({
      where: { variantId, remainingQuantity: { gt: 0 } },
      orderBy: { receivedAt: 'asc' },
      select: { id: true, remainingQuantity: true, unitCost: true },
    });

    const out: Array<{ lotId: string; quantity: number; unitCost: number }> = [];
    let remaining = needed;
    for (const lot of lots) {
      if (remaining <= 0) break;
      const available = Number(lot.remainingQuantity);
      const take = Math.min(remaining, available);
      if (take > 0) {
        out.push({ lotId: lot.id, quantity: take, unitCost: Number(lot.unitCost) });
        remaining -= take;
      }
    }

    if (remaining > 0.0001) {
      const total = lots.reduce((s, l) => s + Number(l.remainingQuantity), 0);
      throw new BadRequestException(
        `Недостаточно товара для списания: доступно ${total}, требуется ${needed}`,
      );
    }
    return out;
  }

  /** Проверка ручного распределения: lot'ы существуют, относятся к этой вариации, есть остаток. */
  private async validateManualAllocations(
    tx: Tx,
    variantId: string,
    needed: number,
    allocations: LotAllocation[],
  ): Promise<Array<{ lotId: string; quantity: number; unitCost: number }>> {
    const sum = allocations.reduce((s, a) => s + a.quantity, 0);
    if (Math.abs(sum - needed) > 0.0001) {
      throw new BadRequestException(
        `Сумма по партиям (${sum}) не совпадает с количеством движения (${needed})`,
      );
    }
    const lotIds = allocations.map((a) => a.lotId);
    const lots = await tx.stockLot.findMany({
      where: { id: { in: lotIds } },
      select: { id: true, variantId: true, remainingQuantity: true, unitCost: true },
    });
    const lotMap = new Map(lots.map((l) => [l.id, l]));
    const out: Array<{ lotId: string; quantity: number; unitCost: number }> = [];
    for (const a of allocations) {
      const lot = lotMap.get(a.lotId);
      if (!lot) throw new NotFoundException(`Партия ${a.lotId} не найдена`);
      if (lot.variantId !== variantId) {
        throw new BadRequestException(
          `Партия ${a.lotId} относится к другой вариации`,
        );
      }
      if (Number(lot.remainingQuantity) - a.quantity < -0.0001) {
        throw new BadRequestException(
          `В партии ${a.lotId} остаток ${lot.remainingQuantity}, требуется ${a.quantity}`,
        );
      }
      out.push({ lotId: a.lotId, quantity: a.quantity, unitCost: Number(lot.unitCost) });
    }
    return out;
  }

  private serialize(m: MovementRow) {
    return {
      id: m.id,
      type: m.type,
      variantId: m.variantId,
      quantity: Number(m.quantity),
      supplierId: m.supplierId,
      customerId: m.customerId,
      userId: m.userId,
      note: m.note,
      totalCost: m.totalCost ? Number(m.totalCost) : null,
      unitPrice: m.unitPrice ? Number(m.unitPrice) : null,
      discountPercent: m.discountPercent ? Number(m.discountPercent) : null,
      reversesId: m.reversesId,
      reversedBy: m.reversedBy
        ? { id: m.reversedBy.id, createdAt: m.reversedBy.createdAt.toISOString() }
        : null,
      createdAt: m.createdAt.toISOString(),
      variant: {
        id: m.variant.id,
        sku: m.variant.sku,
        attributes: (m.variant.attributes ?? {}) as Record<string, string>,
        price: m.variant.price ? Number(m.variant.price) : null,
        product: m.variant.product,
      },
      supplier: m.supplier,
      customer: m.customer,
      user: m.user,
      consumptions: m.consumptions.map((c) => ({
        id: c.id,
        lotId: c.lotId,
        quantity: Number(c.quantity),
        lot: {
          id: c.lot.id,
          receivedAt: c.lot.receivedAt.toISOString(),
          unitCost: Number(c.lot.unitCost),
        },
      })),
    };
  }
}
