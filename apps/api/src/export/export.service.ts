import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toCsv } from '../common/csv';

@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Снимок текущего инвентаря: одна строка на вариацию.
   */
  async inventoryCsv(): Promise<string> {
    const variants = await this.prisma.productVariant.findMany({
      where: { product: { deletedAt: null } },
      include: {
        product: {
          include: { category: { select: { name: true } } },
        },
      },
      orderBy: [{ product: { name: 'asc' } }, { sku: 'asc' }],
    });

    const grouped = await this.prisma.stockMovement.groupBy({
      by: ['variantId', 'type'],
      where: { variantId: { in: variants.map((v) => v.id) } },
      _sum: { quantity: true },
    });
    const stockMap = new Map<string, number>();
    for (const v of variants) stockMap.set(v.id, 0);
    for (const r of grouped) {
      const sum = Number(r._sum.quantity ?? 0);
      const sign = r.type === 'OUT' ? -1 : 1;
      stockMap.set(r.variantId, (stockMap.get(r.variantId) ?? 0) + sign * sum);
    }

    const headers = [
      'Категория',
      'Товар',
      'SKU',
      'Цвет',
      'Атрибуты',
      'Ед.',
      'Цена',
      'Остаток',
      'Порог',
      'Создан',
    ];

    const rows = variants.map((v) => {
      const attrs = (v.attributes ?? {}) as Record<string, string>;
      const color = attrs.color ?? '';
      const otherAttrs = Object.entries(attrs)
        .filter(([k]) => k !== 'color')
        .map(([k, val]) => `${k}=${val}`)
        .join('; ');
      return [
        v.product.category?.name ?? '',
        v.product.name,
        v.sku,
        color,
        otherAttrs,
        v.product.unit,
        v.price !== null ? Number(v.price).toFixed(2) : '',
        String(stockMap.get(v.id) ?? 0),
        v.reorderLevel !== null ? String(v.reorderLevel) : '',
        v.createdAt.toISOString(),
      ];
    });

    return toCsv([headers, ...rows]);
  }

  /**
   * Журнал движений за всё время (или за период через query — на v1 без фильтра).
   */
  async movementsCsv(): Promise<string> {
    const items = await this.prisma.stockMovement.findMany({
      include: {
        variant: {
          include: { product: { select: { name: true, unit: true } } },
        },
        supplier: { select: { name: true } },
        customer: { select: { name: true } },
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const headers = [
      'Дата',
      'Тип',
      'Товар',
      'SKU',
      'Цвет',
      'Кол-во',
      'Ед.',
      'Поставщик',
      'Клиент',
      'Заметка',
      'Сторно для',
      'Кто',
    ];

    const rows = items.map((m) => {
      const attrs = (m.variant.attributes ?? {}) as Record<string, string>;
      return [
        m.createdAt.toISOString(),
        m.type,
        m.variant.product.name,
        m.variant.sku,
        attrs.color ?? '',
        Number(m.quantity).toString(),
        m.variant.product.unit,
        m.supplier?.name ?? '',
        m.customer?.name ?? '',
        m.note ?? '',
        m.reversesId ?? '',
        m.user.name,
      ];
    });

    return toCsv([headers, ...rows]);
  }
}

