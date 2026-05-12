import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/zod.dto';
import { UTF8_BOM, csvDate, csvMoney, toCsv } from '../common/csv';
import { ReportsService } from './reports.service';
import {
  breakdownQuerySchema,
  deadStockQuerySchema,
  movementsQuerySchema,
  reportFiltersSchema,
  summaryQuerySchema,
  timelineQuerySchema,
  type BreakdownQuery,
  type DeadStockQuery,
  type MovementsQuery,
  type ReportFilters,
  type SummaryQuery,
  type TimelineQuery,
} from './reports.dto';

/** Большой лимит для экспорта: всё, что попало в фильтры. На объёмах >100k нужно стримить. */
const CSV_LIMIT = 100_000;

type CsvBreakdownDim = 'customer' | 'product' | 'variant' | 'category' | 'user';

const BREAKDOWN_LABEL: Record<CsvBreakdownDim, string> = {
  customer: 'Клиент',
  product: 'Товар',
  variant: 'Вариация (SKU)',
  category: 'Категория',
  user: 'Менеджер',
};

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  summary(@Query(new ZodValidationPipe(summaryQuerySchema)) query: SummaryQuery) {
    return this.reports.summary(query);
  }

  @Get('timeline')
  timeline(@Query(new ZodValidationPipe(timelineQuerySchema)) query: TimelineQuery) {
    return this.reports.timeline(query);
  }

  @Get('by-customer')
  byCustomer(@Query(new ZodValidationPipe(breakdownQuerySchema)) query: BreakdownQuery) {
    return this.reports.breakdown('customer', query);
  }

  @Get('by-product')
  byProduct(@Query(new ZodValidationPipe(breakdownQuerySchema)) query: BreakdownQuery) {
    return this.reports.breakdown('product', query);
  }

  @Get('by-variant')
  byVariant(@Query(new ZodValidationPipe(breakdownQuerySchema)) query: BreakdownQuery) {
    return this.reports.breakdown('variant', query);
  }

  @Get('by-category')
  byCategory(@Query(new ZodValidationPipe(breakdownQuerySchema)) query: BreakdownQuery) {
    return this.reports.breakdown('category', query);
  }

  @Get('by-manager')
  byManager(@Query(new ZodValidationPipe(breakdownQuerySchema)) query: BreakdownQuery) {
    return this.reports.breakdown('user', query);
  }

  @Get('movements')
  movements(@Query(new ZodValidationPipe(movementsQuerySchema)) query: MovementsQuery) {
    return this.reports.movements(query);
  }

  @Get('dead-stock')
  deadStock(@Query(new ZodValidationPipe(deadStockQuerySchema)) query: DeadStockQuery) {
    return this.reports.deadStock(query);
  }

  // ---- CSV экспорт ----
  // У всех CSV-маршрутов одинаковые фильтры что и у JSON-версий,
  // но без пагинации/limit — отдаём всё под CSV_LIMIT.

  @Get('movements.csv')
  async movementsCsv(
    @Query(new ZodValidationPipe(reportFiltersSchema)) filters: ReportFilters,
    @Res() res: Response,
  ) {
    const data = await this.reports.movements({ ...filters, page: 1, pageSize: CSV_LIMIT });
    const headers = [
      'Дата',
      'Товар',
      'SKU',
      'Категория',
      'Клиент',
      'Скидка %',
      'Кол-во',
      'Цена/ед',
      'Выручка',
      'Себестоимость',
      'Прибыль',
      'Менеджер',
      'Заметка',
    ];
    const rows = data.items.map((m) => [
      csvDate(m.createdAt),
      m.variant.productName,
      m.variant.sku,
      m.variant.categoryName ?? '',
      m.customer?.name ?? '',
      m.discountPercent !== null ? m.discountPercent.toString() : '',
      String(m.qty),
      csvMoney(m.unitPrice),
      csvMoney(m.revenue),
      csvMoney(m.cogs),
      csvMoney(m.profit),
      m.user.name,
      m.note ?? '',
    ]);
    this.sendCsv(res, 'movements', UTF8_BOM + toCsv([headers, ...rows]));
  }

  @Get('by-customer.csv')
  byCustomerCsv(
    @Query(new ZodValidationPipe(breakdownQuerySchema)) query: BreakdownQuery,
    @Res() res: Response,
  ) {
    return this.breakdownCsv('customer', query, res);
  }

  @Get('by-product.csv')
  byProductCsv(
    @Query(new ZodValidationPipe(breakdownQuerySchema)) query: BreakdownQuery,
    @Res() res: Response,
  ) {
    return this.breakdownCsv('product', query, res);
  }

  @Get('by-variant.csv')
  byVariantCsv(
    @Query(new ZodValidationPipe(breakdownQuerySchema)) query: BreakdownQuery,
    @Res() res: Response,
  ) {
    return this.breakdownCsv('variant', query, res);
  }

  @Get('by-category.csv')
  byCategoryCsv(
    @Query(new ZodValidationPipe(breakdownQuerySchema)) query: BreakdownQuery,
    @Res() res: Response,
  ) {
    return this.breakdownCsv('category', query, res);
  }

  @Get('by-manager.csv')
  byManagerCsv(
    @Query(new ZodValidationPipe(breakdownQuerySchema)) query: BreakdownQuery,
    @Res() res: Response,
  ) {
    return this.breakdownCsv('user', query, res);
  }

  @Get('dead-stock.csv')
  async deadStockCsv(
    @Query(new ZodValidationPipe(deadStockQuerySchema)) query: DeadStockQuery,
    @Res() res: Response,
  ) {
    const data = await this.reports.deadStock({ ...query, limit: CSV_LIMIT });
    const headers = [
      'Товар',
      'SKU',
      'Категория',
      'Остаток',
      'Заморожено',
      'Последняя отгрузка',
      'Порог (дней)',
    ];
    const rows = data.items.map((item) => [
      item.productName,
      item.sku,
      item.categoryName ?? '',
      String(item.currentStock),
      csvMoney(item.deadValue),
      csvDate(item.lastOutAt),
      String(data.thresholdDays),
    ]);
    this.sendCsv(res, `dead-stock-${query.days}d`, UTF8_BOM + toCsv([headers, ...rows]));
  }

  // ---- private CSV helpers ----

  private async breakdownCsv(
    dimension: CsvBreakdownDim,
    query: BreakdownQuery,
    res: Response,
  ) {
    const data = await this.reports.breakdown(dimension, { ...query, limit: CSV_LIMIT });
    const headers = [
      BREAKDOWN_LABEL[dimension],
      'Выручка',
      'Себестоимость',
      'Прибыль',
      'Маржа %',
      'Кол-во',
      'Сделок',
    ];
    const rows = data.items.map((item) => [
      item.name,
      csvMoney(item.revenue),
      csvMoney(item.cogs),
      csvMoney(item.profit),
      item.revenue > 0 ? item.marginPct.toFixed(2) : '',
      String(item.qty),
      String(item.transactions),
    ]);
    this.sendCsv(res, `by-${dimension}`, UTF8_BOM + toCsv([headers, ...rows]));
  }

  private sendCsv(res: Response, kind: string, body: string) {
    const date = new Date().toISOString().slice(0, 10);
    const filename = `report-${kind}-${date}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(body);
  }
}
