import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  BreakdownQuery,
  DeadStockQuery,
  MovementsQuery,
  ReportFilters,
  SummaryQuery,
  TimelineQuery,
} from './reports.dto';

const DEFAULT_RANGE_DAYS = 30;

/** Соответствие dimension → SQL-выражения для GROUP BY. */
type BreakdownDimension = 'customer' | 'variant' | 'product' | 'category' | 'user';

interface DimensionConfig {
  /** id-колонка для группировки */
  idExpr: Prisma.Sql;
  /** name-колонка (для join'ов с справочниками) */
  nameExpr: Prisma.Sql;
  /** Дополнительные JOIN'ы поверх стандартных v/p */
  extraJoin: Prisma.Sql;
  /** Доп. фильтр: например, для by-customer исключаем строки без клиента */
  extraWhere: Prisma.Sql;
}

const DIMENSION_CONFIG: Record<BreakdownDimension, DimensionConfig> = {
  customer: {
    idExpr: Prisma.sql`m."customerId"`,
    nameExpr: Prisma.sql`c."name"`,
    extraJoin: Prisma.sql`LEFT JOIN "Customer" c ON c.id = m."customerId"`,
    extraWhere: Prisma.sql`AND m."customerId" IS NOT NULL`,
  },
  variant: {
    idExpr: Prisma.sql`m."variantId"`,
    // Для вариации показываем "<product name> · <sku>"
    nameExpr: Prisma.sql`(p."name" || ' · ' || v."sku")`,
    extraJoin: Prisma.empty,
    extraWhere: Prisma.empty,
  },
  product: {
    idExpr: Prisma.sql`v."productId"`,
    nameExpr: Prisma.sql`p."name"`,
    extraJoin: Prisma.empty,
    extraWhere: Prisma.empty,
  },
  category: {
    idExpr: Prisma.sql`p."categoryId"`,
    nameExpr: Prisma.sql`cat."name"`,
    extraJoin: Prisma.sql`LEFT JOIN "Category" cat ON cat.id = p."categoryId"`,
    extraWhere: Prisma.sql`AND p."categoryId" IS NOT NULL`,
  },
  user: {
    idExpr: Prisma.sql`m."userId"`,
    nameExpr: Prisma.sql`u."name"`,
    extraJoin: Prisma.sql`LEFT JOIN "User" u ON u.id = m."userId"`,
    extraWhere: Prisma.empty,
  },
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(query: SummaryQuery) {
    const { from, to } = this.normalizeRange(query);

    // Параметры предыдущего периода (если запрошен).
    let prevFrom: Date | null = null;
    let prevTo: Date | null = null;
    if (query.compareToPrevious) {
      const ms = to.getTime() - from.getTime();
      prevFrom = new Date(from.getTime() - ms - 1);
      prevTo = new Date(from.getTime() - 1);
    }

    // Текущий + предыдущий периоды агрегируются параллельно — независимые запросы.
    const [current, previous] = await Promise.all([
      this.aggregate(from, to, query),
      prevFrom && prevTo ? this.aggregate(prevFrom, prevTo, query) : Promise.resolve(null),
    ]);

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      ...current,
      previous:
        previous && prevFrom && prevTo
          ? {
              period: { from: prevFrom.toISOString(), to: prevTo.toISOString() },
              ...previous,
            }
          : null,
    };
  }

  /** Внутренний агрегат KPI за диапазон. Используется в summary и в compare-to-previous. */
  private async aggregate(from: Date, to: Date, filters: ReportFilters) {
    // Два запроса независимы — гоним параллельно.
    const [totals, returnsRow] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          revenue: string | null;
          cogs: string | null;
          transactions: bigint;
          priced_transactions: bigint;
          qty: string | null;
        }>
      >`
        SELECT
          COALESCE(SUM(ABS(m."quantity") * m."unitPrice"), 0)::text AS revenue,
          COALESCE(SUM(m."totalCost"), 0)::text AS cogs,
          COUNT(*) AS transactions,
          COUNT(m."unitPrice") AS priced_transactions,
          COALESCE(SUM(ABS(m."quantity")), 0)::text AS qty
        FROM "StockMovement" m
        LEFT JOIN "ProductVariant" v ON v.id = m."variantId"
        LEFT JOIN "Product" p ON p.id = v."productId"
        WHERE m."type" = 'OUT'
          AND m."createdAt" >= ${from}
          AND m."createdAt" <= ${to}
          AND NOT EXISTS (
            SELECT 1 FROM "StockMovement" r WHERE r."reversesId" = m.id
          )
          ${this.filterFragment(filters)}
      `,
      this.prisma.$queryRaw<Array<{ count: bigint; qty: string | null }>>`
        SELECT COUNT(*) AS count,
               COALESCE(SUM(ABS(r."quantity")), 0)::text AS qty
        FROM "StockMovement" r
        JOIN "StockMovement" o ON o.id = r."reversesId"
        WHERE r."reversesId" IS NOT NULL
          AND o."type" = 'OUT'
          AND r."createdAt" >= ${from}
          AND r."createdAt" <= ${to}
      `,
    ]);

    const row = totals[0];
    const revenue = Number(row?.revenue ?? 0);
    const cogs = Number(row?.cogs ?? 0);
    const transactions = Number(row?.transactions ?? 0);
    const pricedTransactions = Number(row?.priced_transactions ?? 0);
    const qty = Number(row?.qty ?? 0);
    const profit = revenue - cogs;
    const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;
    const avgTicket = transactions > 0 ? revenue / transactions : 0;

    return {
      revenue,
      cogs,
      profit,
      marginPct,
      transactions,
      pricedTransactions,
      qty,
      avgTicket,
      returns: {
        count: Number(returnsRow[0]?.count ?? 0),
        qty: Number(returnsRow[0]?.qty ?? 0),
      },
    };
  }

  async timeline(query: TimelineQuery) {
    const { from, to } = this.normalizeRange(query);
    const truncUnit = query.granularity;
    // truncUnit — whitelisted enum, поэтому Prisma.raw здесь безопасен.
    const truncExpr = Prisma.raw(`date_trunc('${truncUnit}', m."createdAt")`);

    const rows = await this.prisma.$queryRaw<
      Array<{
        bucket: Date;
        revenue: string | null;
        cogs: string | null;
        transactions: bigint;
        qty: string | null;
      }>
    >`
      SELECT
        ${truncExpr} AS bucket,
        COALESCE(SUM(ABS(m."quantity") * m."unitPrice"), 0)::text AS revenue,
        COALESCE(SUM(m."totalCost"), 0)::text AS cogs,
        COUNT(*) AS transactions,
        COALESCE(SUM(ABS(m."quantity")), 0)::text AS qty
      FROM "StockMovement" m
      LEFT JOIN "ProductVariant" v ON v.id = m."variantId"
      LEFT JOIN "Product" p ON p.id = v."productId"
      WHERE m."type" = 'OUT'
        AND m."createdAt" >= ${from}
        AND m."createdAt" <= ${to}
        AND NOT EXISTS (
          SELECT 1 FROM "StockMovement" r WHERE r."reversesId" = m.id
        )
        ${this.filterFragment(query)}
      GROUP BY bucket
      ORDER BY bucket
    `;

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      granularity: truncUnit,
      points: rows.map((r) => {
        const revenue = Number(r.revenue ?? 0);
        const cogs = Number(r.cogs ?? 0);
        return {
          bucket: r.bucket.toISOString(),
          revenue,
          cogs,
          profit: revenue - cogs,
          transactions: Number(r.transactions),
          qty: Number(r.qty ?? 0),
        };
      }),
    };
  }

  /**
   * Общий фрагмент WHERE для всех аналитических запросов.
   * Все ID-фильтры идут как text[] параметры — Prisma подставляет безопасно.
   */
  private filterFragment(filters: ReportFilters): Prisma.Sql {
    const parts: Prisma.Sql[] = [];
    if (filters.customerIds) {
      parts.push(Prisma.sql`AND m."customerId" = ANY(${filters.customerIds}::text[])`);
    }
    if (filters.variantIds) {
      parts.push(Prisma.sql`AND m."variantId" = ANY(${filters.variantIds}::text[])`);
    }
    if (filters.productIds) {
      parts.push(Prisma.sql`AND v."productId" = ANY(${filters.productIds}::text[])`);
    }
    if (filters.categoryIds) {
      parts.push(Prisma.sql`AND p."categoryId" = ANY(${filters.categoryIds}::text[])`);
    }
    if (filters.userIds) {
      parts.push(Prisma.sql`AND m."userId" = ANY(${filters.userIds}::text[])`);
    }
    return parts.length === 0 ? Prisma.empty : Prisma.join(parts, ' ');
  }

  /**
   * Мёртвый сток: SKU с остатком, у которых не было OUT-движений за последние N дней
   * (или вообще никогда не отгружались). Отсортирован по deadValue = qty × unitCost из партий.
   * Это деньги, замороженные на полке — главный сигнал для распродаж или возврата поставщику.
   */
  async deadStock(query: DeadStockQuery) {
    const cutoff = new Date(Date.now() - query.days * 24 * 60 * 60 * 1000);
    const catFilter = query.categoryIds
      ? Prisma.sql`AND p."categoryId" = ANY(${query.categoryIds}::text[])`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      Array<{
        variant_id: string;
        sku: string;
        product_name: string;
        category_id: string | null;
        category_name: string | null;
        current_stock: string | null;
        dead_value: string | null;
        last_out_at: Date | null;
      }>
    >`
      WITH last_out AS (
        SELECT m."variantId", MAX(m."createdAt") AS last_at
        FROM "StockMovement" m
        WHERE m."type" = 'OUT'
          AND NOT EXISTS (
            SELECT 1 FROM "StockMovement" r WHERE r."reversesId" = m.id
          )
        GROUP BY m."variantId"
      ),
      stock AS (
        SELECT l."variantId",
               COALESCE(SUM(l."remainingQuantity"), 0)::numeric AS current_stock,
               COALESCE(SUM(l."remainingQuantity" * l."unitCost"), 0)::numeric AS dead_value
        FROM "StockLot" l
        GROUP BY l."variantId"
      )
      SELECT
        v.id AS variant_id,
        v.sku,
        p."name" AS product_name,
        p."categoryId" AS category_id,
        cat."name" AS category_name,
        COALESCE(s.current_stock, 0) AS current_stock,
        COALESCE(s.dead_value, 0) AS dead_value,
        lo.last_at AS last_out_at
      FROM "ProductVariant" v
      JOIN "Product" p ON p.id = v."productId"
      LEFT JOIN "Category" cat ON cat.id = p."categoryId"
      LEFT JOIN stock s ON s."variantId" = v.id
      LEFT JOIN last_out lo ON lo."variantId" = v.id
      WHERE p."deletedAt" IS NULL
        AND COALESCE(s.current_stock, 0) > 0
        AND (lo.last_at IS NULL OR lo.last_at < ${cutoff})
        ${catFilter}
      ORDER BY dead_value DESC NULLS LAST, v.sku ASC
      LIMIT ${query.limit}
    `;

    return {
      thresholdDays: query.days,
      cutoff: cutoff.toISOString(),
      items: rows.map((r) => ({
        variantId: r.variant_id,
        sku: r.sku,
        productName: r.product_name,
        categoryId: r.category_id,
        categoryName: r.category_name,
        currentStock: Number(r.current_stock ?? 0),
        deadValue: Number(r.dead_value ?? 0),
        lastOutAt: r.last_out_at ? r.last_out_at.toISOString() : null,
      })),
    };
  }

  /** Default: last 30 days. To дефолтится на now, from на now-30d. */
  private normalizeRange(filters: { from?: Date; to?: Date }) {
    const to = filters.to ?? new Date();
    const from =
      filters.from ?? new Date(to.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
    return { from, to };
  }

  /**
   * Универсальная агрегация по dimension. Используется всеми /by-{customer|product|category|manager|variant}.
   * Возвращает топ-N по выбранному sort с метриками: revenue, cogs, profit, qty, transactions, marginPct.
   */
  async breakdown(dimension: BreakdownDimension, query: BreakdownQuery) {
    const { from, to } = this.normalizeRange(query);
    const dim = DIMENSION_CONFIG[dimension];

    // sort — whitelisted enum, безопасно интерполируется в Prisma.raw.
    const sortColumn = query.sort; // 'revenue' | 'profit' | 'qty' | 'transactions'
    const orderBy = Prisma.raw(`ORDER BY "${sortColumn}" DESC NULLS LAST`);

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string | null;
        name: string | null;
        revenue: string | null;
        cogs: string | null;
        profit: string | null;
        qty: string | null;
        transactions: bigint;
      }>
    >`
      SELECT
        ${dim.idExpr} AS id,
        ${dim.nameExpr} AS name,
        COALESCE(SUM(ABS(m."quantity") * m."unitPrice"), 0)::numeric AS "revenue",
        COALESCE(SUM(m."totalCost"), 0)::numeric AS "cogs",
        (COALESCE(SUM(ABS(m."quantity") * m."unitPrice"), 0)
          - COALESCE(SUM(m."totalCost"), 0))::numeric AS "profit",
        COALESCE(SUM(ABS(m."quantity")), 0)::numeric AS "qty",
        COUNT(*) AS "transactions"
      FROM "StockMovement" m
      LEFT JOIN "ProductVariant" v ON v.id = m."variantId"
      LEFT JOIN "Product" p ON p.id = v."productId"
      ${dim.extraJoin}
      WHERE m."type" = 'OUT'
        AND m."createdAt" >= ${from}
        AND m."createdAt" <= ${to}
        AND NOT EXISTS (
          SELECT 1 FROM "StockMovement" r WHERE r."reversesId" = m.id
        )
        ${dim.extraWhere}
        ${this.filterFragment(query)}
      GROUP BY ${dim.idExpr}, ${dim.nameExpr}
      ${orderBy}
      LIMIT ${query.limit}
    `;

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      dimension,
      sort: query.sort,
      items: rows.map((r) => {
        const revenue = Number(r.revenue ?? 0);
        const cogs = Number(r.cogs ?? 0);
        const profit = Number(r.profit ?? 0);
        return {
          id: r.id,
          name: r.name ?? '(без названия)',
          revenue,
          cogs,
          profit,
          marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
          qty: Number(r.qty ?? 0),
          transactions: Number(r.transactions),
        };
      }),
    };
  }

  /**
   * Детальный журнал OUT-движений за период с теми же фильтрами.
   * Возвращает каждую строку с revenue (qty × unitPrice) и cogs (totalCost), отдельно.
   */
  async movements(query: MovementsQuery) {
    const { from, to } = this.normalizeRange(query);

    const filter = this.filterFragment(query);
    const offset = (query.page - 1) * query.pageSize;

    const [rows, totalRow] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          id: string;
          createdAt: Date;
          quantity: string;
          unitPrice: string | null;
          totalCost: string | null;
          discountPercent: string | null;
          note: string | null;
          customerId: string | null;
          customerName: string | null;
          variantId: string;
          sku: string;
          productName: string;
          categoryId: string | null;
          categoryName: string | null;
          userId: string;
          userName: string;
        }>
      >`
        SELECT
          m.id,
          m."createdAt",
          m."quantity"::text AS "quantity",
          m."unitPrice"::text AS "unitPrice",
          m."totalCost"::text AS "totalCost",
          m."discountPercent"::text AS "discountPercent",
          m."note",
          m."customerId",
          c."name" AS "customerName",
          m."variantId",
          v."sku",
          p."name" AS "productName",
          p."categoryId",
          cat."name" AS "categoryName",
          m."userId",
          u."name" AS "userName"
        FROM "StockMovement" m
        LEFT JOIN "ProductVariant" v ON v.id = m."variantId"
        LEFT JOIN "Product" p ON p.id = v."productId"
        LEFT JOIN "Category" cat ON cat.id = p."categoryId"
        LEFT JOIN "Customer" c ON c.id = m."customerId"
        LEFT JOIN "User" u ON u.id = m."userId"
        WHERE m."type" = 'OUT'
          AND m."createdAt" >= ${from}
          AND m."createdAt" <= ${to}
          AND NOT EXISTS (
            SELECT 1 FROM "StockMovement" r WHERE r."reversesId" = m.id
          )
          ${filter}
        ORDER BY m."createdAt" DESC
        LIMIT ${query.pageSize}
        OFFSET ${offset}
      `,
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) AS count
        FROM "StockMovement" m
        LEFT JOIN "ProductVariant" v ON v.id = m."variantId"
        LEFT JOIN "Product" p ON p.id = v."productId"
        WHERE m."type" = 'OUT'
          AND m."createdAt" >= ${from}
          AND m."createdAt" <= ${to}
          AND NOT EXISTS (
            SELECT 1 FROM "StockMovement" r WHERE r."reversesId" = m.id
          )
          ${filter}
      `,
    ]);

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      page: query.page,
      pageSize: query.pageSize,
      total: Number(totalRow[0]?.count ?? 0),
      items: rows.map((r) => {
        const qty = Math.abs(Number(r.quantity));
        const unitPrice = r.unitPrice === null ? null : Number(r.unitPrice);
        const cogs = r.totalCost === null ? null : Number(r.totalCost);
        const revenue = unitPrice !== null ? qty * unitPrice : null;
        const profit = revenue !== null && cogs !== null ? revenue - cogs : null;
        return {
          id: r.id,
          createdAt: r.createdAt.toISOString(),
          qty,
          unitPrice,
          discountPercent: r.discountPercent === null ? null : Number(r.discountPercent),
          revenue,
          cogs,
          profit,
          note: r.note,
          customer: r.customerId
            ? { id: r.customerId, name: r.customerName ?? '(удалён)' }
            : null,
          variant: {
            id: r.variantId,
            sku: r.sku,
            productName: r.productName,
            categoryId: r.categoryId,
            categoryName: r.categoryName,
          },
          user: { id: r.userId, name: r.userName },
        };
      }),
    };
  }
}
