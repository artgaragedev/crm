'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { toast } from 'sonner';
import {
  api,
  ApiError,
  type Granularity,
  type ReportFilters,
  type ReportSummary,
  type ReportTimeline,
} from '@/lib/api';
import { cn, formatPrice } from '@/lib/utils';
import { presetRange, type DateRange } from '@/lib/date-ranges';
import { Card, CardContent } from '@/components/ui/card';
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRangePicker } from './date-range-picker';
import { TimelineChart } from './timeline-chart';
import { BreakdownTabs } from './breakdown-tabs';
import { MovementsTable } from './movements-table';
import { DeadStockPanel } from './dead-stock-panel';

export default function ReportsPage() {
  const [range, setRange] = useState<DateRange>(() => presetRange('last30'));
  const [customerIds, setCustomerIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [compareEnabled, setCompareEnabled] = useState(false);

  // Справочники для multi-select
  const [customerOptions, setCustomerOptions] = useState<MultiSelectOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<MultiSelectOption[]>([]);

  // Сами отчёты — KPI + timeline
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [timeline, setTimeline] = useState<ReportTimeline | null>(null);
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(true);

  /** Единый объект фильтров для всех виджетов. Стабилизирован для useEffect. */
  const filters = useMemo<ReportFilters>(
    () => ({
      from: range.from,
      to: range.to,
      customerIds: customerIds.length > 0 ? customerIds : undefined,
      categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
    }),
    [range.from, range.to, customerIds, categoryIds],
  );

  // Загрузка справочников один раз.
  useEffect(() => {
    void (async () => {
      try {
        const [c, cats] = await Promise.all([
          api.customers.list({ pageSize: 500 }),
          api.categories.list({ pageSize: 500 }),
        ]);
        setCustomerOptions(
          c.items.map((x) => ({ value: x.id, label: x.name, searchValue: x.name })),
        );
        setCategoryOptions(
          cats.items.map((x) => ({ value: x.id, label: x.name, searchValue: x.name })),
        );
      } catch {
        // справочники не критичны для отображения отчёта
      }
    })();
  }, []);

  // Загрузка summary (с опциональным compare-to-previous)
  useEffect(() => {
    let cancelled = false;
    setSummaryLoading(true);
    api.reports
      .summary({ ...filters, compareToPrevious: compareEnabled })
      .then((res) => {
        if (!cancelled) setSummary(res);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? err.message : 'Не удалось загрузить сводку';
        toast.error(msg);
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, compareEnabled]);

  // Загрузка timeline
  useEffect(() => {
    let cancelled = false;
    setTimelineLoading(true);
    api.reports
      .timeline({ ...filters, granularity })
      .then((res) => {
        if (!cancelled) setTimeline(res);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? err.message : 'Не удалось загрузить динамику';
        toast.error(msg);
      })
      .finally(() => {
        if (!cancelled) setTimelineLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, granularity]);

  return (
    <>
      <PageHeader
        title="Отчёты"
        description="Аналитика продаж по периоду, клиентам и товарам."
      />

      {/* Master controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DateRangePicker value={range} onChange={setRange} />
        <MultiSelect
          options={customerOptions}
          value={customerIds}
          onChange={setCustomerIds}
          placeholder="Все клиенты"
          searchPlaceholder="Поиск клиента"
          triggerClassName="w-48"
        />
        <MultiSelect
          options={categoryOptions}
          value={categoryIds}
          onChange={setCategoryIds}
          placeholder="Все категории"
          searchPlaceholder="Поиск категории"
          triggerClassName="w-48"
        />
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
          <input
            type="checkbox"
            checked={compareEnabled}
            onChange={(e) => setCompareEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          <span>Сравнить с пред. периодом</span>
        </label>
      </div>

      {/* KPI */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard
          label="Выручка"
          value={summary ? formatPrice(summary.revenue) : null}
          loading={summaryLoading}
          delta={
            summary?.previous
              ? pctDelta(summary.revenue, summary.previous.revenue, 'higherIsBetter')
              : null
          }
          previousLabel={summary?.previous ? formatPrice(summary.previous.revenue) : null}
        />
        <KpiCard
          label="Прибыль"
          value={summary ? formatPrice(summary.profit) : null}
          loading={summaryLoading}
          accent={summary && summary.profit < 0 ? 'negative' : 'positive'}
          delta={
            summary?.previous
              ? pctDelta(summary.profit, summary.previous.profit, 'higherIsBetter')
              : null
          }
          previousLabel={summary?.previous ? formatPrice(summary.previous.profit) : null}
        />
        <KpiCard
          label="Маржа"
          value={
            summary
              ? summary.revenue > 0
                ? `${summary.marginPct.toFixed(1)}%`
                : '—'
              : null
          }
          loading={summaryLoading}
          delta={
            summary?.previous
              ? ppDelta(summary.marginPct, summary.previous.marginPct)
              : null
          }
          previousLabel={
            summary?.previous && summary.previous.revenue > 0
              ? `${summary.previous.marginPct.toFixed(1)}%`
              : summary?.previous
                ? '—'
                : null
          }
        />
        <KpiCard
          label="Сделок"
          value={summary ? String(summary.transactions) : null}
          loading={summaryLoading}
          hint={
            summary && summary.pricedTransactions < summary.transactions
              ? `${summary.transactions - summary.pricedTransactions} без цены`
              : undefined
          }
          delta={
            summary?.previous
              ? pctDelta(summary.transactions, summary.previous.transactions, 'higherIsBetter')
              : null
          }
          previousLabel={
            summary?.previous ? String(summary.previous.transactions) : null
          }
        />
        <KpiCard
          label="Средний чек"
          value={summary ? formatPrice(summary.avgTicket) : null}
          loading={summaryLoading}
          delta={
            summary?.previous
              ? pctDelta(summary.avgTicket, summary.previous.avgTicket, 'higherIsBetter')
              : null
          }
          previousLabel={summary?.previous ? formatPrice(summary.previous.avgTicket) : null}
        />
      </div>

      {summary && summary.returns.count > 0 && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          За период проведено{' '}
          <span className="font-semibold">{summary.returns.count}</span> возврат(ов) на{' '}
          <span className="font-semibold">{summary.returns.qty}</span> единиц — выручка/прибыль
          уже не включают аннулированные отгрузки.
        </div>
      )}

      <div className="mb-6">
        <TimelineChart
          data={timeline}
          loading={timelineLoading}
          granularity={granularity}
          onGranularityChange={setGranularity}
        />
      </div>

      <div className="mb-6">
        <BreakdownTabs filters={filters} />
      </div>

      <div className="mb-6">
        <DeadStockPanel />
      </div>

      <MovementsTable filters={filters} />
    </>
  );
}

interface KpiDelta {
  /** Подписанное процентное (или процентно-пунктное) значение. */
  pct: number;
  /** 'pct' = ±X% (мультипликативная), 'pp' = ±X пп (для маржи). */
  unit: 'pct' | 'pp';
  /** Куда показывать стрелку: 'up' положительная динамика, 'down' отрицательная, 'flat' равно. */
  direction: 'up' | 'down' | 'flat';
  /** Для нулевой базы: % посчитать нельзя — показываем "новое" значение, не пытаемся выдумывать. */
  newSeries?: boolean;
}

function KpiCard({
  label,
  value,
  loading,
  hint,
  accent,
  delta,
  previousLabel,
}: {
  label: string;
  value: string | null;
  loading: boolean;
  hint?: string;
  accent?: 'positive' | 'negative';
  delta?: KpiDelta | null;
  previousLabel?: string | null;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        {loading && value === null ? (
          <Skeleton className="mt-2 h-6 w-24" />
        ) : (
          <div
            className={cn(
              'mt-1 text-xl font-semibold tabular-nums',
              accent === 'negative' && 'text-rose-700',
              accent === 'positive' && value && value !== '—' && 'text-foreground',
            )}
          >
            {value ?? '—'}
          </div>
        )}
        {delta && <DeltaLine delta={delta} previousLabel={previousLabel} />}
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function DeltaLine({
  delta,
  previousLabel,
}: {
  delta: KpiDelta;
  previousLabel: string | null | undefined;
}) {
  const Icon =
    delta.direction === 'up' ? ArrowUpRight : delta.direction === 'down' ? ArrowDownRight : Minus;
  const color =
    delta.direction === 'up'
      ? 'text-emerald-700'
      : delta.direction === 'down'
        ? 'text-rose-700'
        : 'text-muted-foreground';
  return (
    <div className={cn('mt-1 flex items-center gap-1 text-xs', color)}>
      <Icon className="h-3 w-3" />
      {delta.newSeries ? (
        <span>впервые</span>
      ) : (
        <span className="tabular-nums">
          {delta.pct >= 0 ? '+' : ''}
          {delta.pct.toFixed(1)}
          {delta.unit === 'pp' ? ' пп' : '%'}
        </span>
      )}
      {previousLabel && (
        <span className="text-muted-foreground">· было {previousLabel}</span>
      )}
    </div>
  );
}

/**
 * Процентная дельта между двумя величинами с защитой от деления на ноль.
 * direction зависит от того, "больше = лучше" или нет (sense='higherIsBetter' для revenue/profit/transactions).
 */
function pctDelta(
  current: number,
  previous: number,
  sense: 'higherIsBetter' | 'lowerIsBetter',
): KpiDelta {
  if (previous === 0 && current === 0) {
    return { pct: 0, unit: 'pct', direction: 'flat' };
  }
  if (previous === 0) {
    // Делить на ноль нельзя — честно говорим "впервые".
    return { pct: 0, unit: 'pct', direction: 'up', newSeries: true };
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const direction =
    pct === 0 ? 'flat' : (pct > 0) === (sense === 'higherIsBetter') ? 'up' : 'down';
  return { pct, unit: 'pct', direction };
}

/** Дельта в процентных пунктах — для маржи. */
function ppDelta(current: number, previous: number): KpiDelta {
  const diff = current - previous;
  return {
    pct: diff,
    unit: 'pp',
    direction: diff === 0 ? 'flat' : diff > 0 ? 'up' : 'down',
  };
}

