import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_LOW_STOCK_THRESHOLD = 5;
const RECENT_LIMIT = 10;
const LOW_STOCK_LIMIT = 10;
const ACTIVITY_DAYS = 30;

const MOVEMENT_INCLUDE = {
  variant: {
    include: {
      product: { select: { id: true, name: true, unit: true, categoryId: true } },
    },
  },
  customer: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
  user: { select: { id: true, name: true, email: true } },
  reversedBy: { select: { id: true, createdAt: true } },
} satisfies Prisma.StockMovementInclude;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const since = new Date(Date.now() - ACTIVITY_DAYS * 24 * 60 * 60 * 1000);

    // Все 5 запросов независимы — гоним параллельно одним Promise.all.
    // На Neon cross-region это ~1с вместо ~3-5с по сравнению с последовательным await.
    const [variants, stockGrouped, lotCostAgg, activityGrouped, recent] =
      await Promise.all([
        this.prisma.productVariant.findMany({
          where: { product: { deletedAt: null } },
          include: { product: { select: { id: true, name: true, unit: true } } },
        }),
        this.prisma.stockMovement.groupBy({
          by: ['variantId', 'type'],
          _sum: { quantity: true },
        }),
        this.prisma.stockLot.findMany({
          where: { variant: { product: { deletedAt: null } } },
          select: { remainingQuantity: true, unitCost: true },
        }),
        this.prisma.stockMovement.groupBy({
          by: ['type'],
          where: { createdAt: { gte: since } },
          _count: true,
        }),
        this.prisma.stockMovement.findMany({
          take: RECENT_LIMIT,
          orderBy: { createdAt: 'desc' },
          include: MOVEMENT_INCLUDE,
        }),
      ]);

    // stockMap нужен для итерации по variants ниже — пересобираем из stockGrouped.
    const stockMap = new Map<string, number>();
    for (const v of variants) stockMap.set(v.id, 0);
    for (const row of stockGrouped) {
      const sum = Number(row._sum.quantity ?? 0);
      const sign = row.type === 'OUT' ? -1 : 1;
      stockMap.set(row.variantId, (stockMap.get(row.variantId) ?? 0) + sign * sum);
    }

    // 3. Inventory KPI.
    let totalValue = 0;
    let pricedCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    const lowStockEntries: Array<{
      variantId: string;
      productName: string;
      sku: string;
      attributes: Record<string, string>;
      currentStock: number;
      unit: string;
    }> = [];

    for (const v of variants) {
      const stock = stockMap.get(v.id) ?? 0;
      const threshold = v.reorderLevel ?? DEFAULT_LOW_STOCK_THRESHOLD;

      if (v.price !== null) {
        pricedCount++;
        if (stock > 0) totalValue += Number(v.price) * stock;
      }

      if (stock <= 0) {
        outOfStockCount++;
      } else if (stock <= threshold) {
        lowStockCount++;
      }

      if (stock <= threshold) {
        lowStockEntries.push({
          variantId: v.id,
          productName: v.product.name,
          sku: v.sku,
          attributes: (v.attributes ?? {}) as Record<string, string>,
          currentStock: stock,
          unit: v.product.unit,
        });
      }
    }

    lowStockEntries.sort((a, b) => a.currentStock - b.currentStock);

    // Inventory cost (по партиям): sum(lot.remainingQuantity × lot.unitCost).
    let inventoryCost = 0;
    for (const lot of lotCostAgg) {
      const r = Number(lot.remainingQuantity);
      if (r > 0) inventoryCost += r * Number(lot.unitCost);
    }

    // Activity 30 дней.
    const counts: Record<'IN' | 'OUT' | 'ADJUST', number> = { IN: 0, OUT: 0, ADJUST: 0 };
    for (const row of activityGrouped) counts[row.type] = row._count;

    return {
      inventory: {
        totalVariants: variants.length,
        pricedVariants: pricedCount,
        /** Розничная стоимость остатков (qty × selling price). */
        totalValue,
        /** Себестоимость остатков (sum of remaining lot qty × lot unitCost). */
        inventoryCost,
        lowStockCount,
        outOfStockCount,
      },
      activity: {
        days: ACTIVITY_DAYS,
        total: counts.IN + counts.OUT + counts.ADJUST,
        in: counts.IN,
        out: counts.OUT,
        adjust: counts.ADJUST,
      },
      lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
      lowStock: lowStockEntries.slice(0, LOW_STOCK_LIMIT),
      recentMovements: recent.map((m) => ({
        id: m.id,
        type: m.type,
        variantId: m.variantId,
        quantity: Number(m.quantity),
        supplierId: m.supplierId,
        customerId: m.customerId,
        userId: m.userId,
        note: m.note,
        totalCost: m.totalCost ? Number(m.totalCost) : null,
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
      })),
    };
  }
}
