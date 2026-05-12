import { z } from 'zod';

/**
 * Парсит CSV или повторяющийся параметр в массив строк.
 * Принимает: `?ids=a,b,c` или `?ids=a&ids=b&ids=c`.
 */
const idList = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => {
    if (v === undefined) return undefined;
    const raw = Array.isArray(v) ? v.flatMap((s) => s.split(',')) : v.split(',');
    const ids = raw.map((s) => s.trim()).filter((s) => s.length > 0);
    return ids.length > 0 ? ids : undefined;
  });

const dateField = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date')
  .optional()
  .transform((s) => (s === undefined ? undefined : new Date(s)));

export const reportFiltersSchema = z.object({
  from: dateField,
  to: dateField,
  customerIds: idList,
  variantIds: idList,
  productIds: idList,
  categoryIds: idList,
  userIds: idList,
});
export type ReportFilters = z.infer<typeof reportFiltersSchema>;

const booleanFlag = z
  .union([z.literal('true'), z.literal('false'), z.boolean()])
  .optional()
  .transform((v) => v === true || v === 'true');

export const summaryQuerySchema = reportFiltersSchema.extend({
  compareToPrevious: booleanFlag,
});
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;

export const timelineQuerySchema = reportFiltersSchema.extend({
  granularity: z.enum(['day', 'week', 'month']).default('day'),
});
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;

const sortField = z.enum(['revenue', 'profit', 'qty', 'transactions']).default('revenue');
const limitField = z.coerce.number().int().min(1).max(500).default(50);

export const breakdownQuerySchema = reportFiltersSchema.extend({
  sort: sortField,
  limit: limitField,
});
export type BreakdownQuery = z.infer<typeof breakdownQuerySchema>;

export const movementsQuerySchema = reportFiltersSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});
export type MovementsQuery = z.infer<typeof movementsQuerySchema>;

export const deadStockQuerySchema = z.object({
  /** Сколько дней без OUT-движений считать "мёртвым" остатком. */
  days: z.coerce.number().int().min(1).max(3650).default(60),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  /** Опц. фильтры — те же, что в других отчётах, но обычно используют только category. */
  categoryIds: idList,
});
export type DeadStockQuery = z.infer<typeof deadStockQuerySchema>;
