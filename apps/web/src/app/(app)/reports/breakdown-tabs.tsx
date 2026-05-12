'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  api,
  ApiError,
  type BreakdownSort,
  type ReportBreakdown,
  type ReportCsvKind,
  type ReportFilters,
} from '@/lib/api';
import { cn, formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type BreakdownKey = 'customer' | 'product' | 'variant' | 'category';

const TABS: Array<{ key: BreakdownKey; label: string; entityLabel: string }> = [
  { key: 'customer', label: 'По клиентам', entityLabel: 'Клиент' },
  { key: 'product', label: 'По товарам', entityLabel: 'Товар' },
  { key: 'variant', label: 'По вариациям', entityLabel: 'Вариация (SKU)' },
  { key: 'category', label: 'По категориям', entityLabel: 'Категория' },
];

const SORT_COLUMNS: Array<{ key: BreakdownSort; label: string; align: 'right' }> = [
  { key: 'revenue', label: 'Выручка', align: 'right' },
  { key: 'profit', label: 'Прибыль', align: 'right' },
  { key: 'qty', label: 'Кол-во', align: 'right' },
  { key: 'transactions', label: 'Сделок', align: 'right' },
];

interface Props {
  filters: ReportFilters;
}

const fetchers = {
  customer: api.reports.byCustomer,
  product: api.reports.byProduct,
  variant: api.reports.byVariant,
  category: api.reports.byCategory,
};

const CSV_KIND: Record<BreakdownKey, ReportCsvKind> = {
  customer: 'by-customer',
  product: 'by-product',
  variant: 'by-variant',
  category: 'by-category',
};

export function BreakdownTabs({ filters }: Props) {
  const [activeTab, setActiveTab] = useState<BreakdownKey>('customer');
  const [sort, setSort] = useState<BreakdownSort>('revenue');
  const [data, setData] = useState<ReportBreakdown | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchers[activeTab]({ ...filters, sort, limit: 50 })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? err.message : 'Не удалось загрузить отчёт';
        toast.error(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, sort, filters]);

  const currentTab = TABS.find((t) => t.key === activeTab)!;
  const isEmpty = !loading && data && data.items.length === 0;

  return (
    <div>
      {/* Tabs */}
      <div className="mb-3 flex flex-wrap items-center gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              activeTab === t.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto mb-1"
          disabled={!data || data.items.length === 0}
          onClick={() =>
            api.exporter
              .report(CSV_KIND[activeTab], { ...filters, sort })
              .catch((e) => toast.error(String(e)))
          }
        >
          <Download className="mr-2 h-4 w-4" />
          CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading && !data ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isEmpty ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Нет данных за выбранный период
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{currentTab.entityLabel}</TableHead>
                  {SORT_COLUMNS.map((col) => (
                    <TableHead key={col.key} className="text-right">
                      <button
                        type="button"
                        onClick={() => setSort(col.key)}
                        className={cn(
                          'inline-flex items-center gap-1 hover:text-foreground',
                          sort === col.key ? 'text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {col.label}
                        {sort === col.key && <ArrowDown className="h-3 w-3" />}
                      </button>
                    </TableHead>
                  ))}
                  <TableHead className="w-20 text-right text-muted-foreground">
                    Маржа
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.map((item) => (
                  <TableRow key={item.id ?? item.name}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(item.revenue)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        item.profit < 0 && 'text-rose-700',
                      )}
                    >
                      {formatPrice(item.profit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatQty(item.qty)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {item.transactions}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums text-xs',
                        item.marginPct < 0
                          ? 'text-rose-700'
                          : item.marginPct === 0
                            ? 'text-muted-foreground'
                            : 'text-emerald-700',
                      )}
                    >
                      {item.revenue > 0 ? `${item.marginPct.toFixed(1)}%` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatQty(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}
