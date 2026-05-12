'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Download } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, type DeadStockReport } from '@/lib/api';
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

const DAYS_OPTIONS = [30, 60, 90, 180];

export function DeadStockPanel() {
  const [days, setDays] = useState(60);
  const [data, setData] = useState<DeadStockReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.reports
      .deadStock({ days, limit: 50 })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? err.message : 'Не удалось загрузить мёртвый сток';
        toast.error(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const totalDeadValue = data?.items.reduce((s, it) => s + it.deadValue, 0) ?? 0;
  const isEmpty = !loading && data && data.items.length === 0;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Мёртвый сток</h3>
          <span className="text-xs text-muted-foreground">
            SKU с остатком, по которым не было отгрузок
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border bg-background p-0.5">
            {DAYS_OPTIONS.map((d) => (
              <Button
                key={d}
                type="button"
                size="sm"
                variant={days === d ? 'default' : 'ghost'}
                className="h-7 px-2 text-xs"
                onClick={() => setDays(d)}
              >
                {d}+ дн.
              </Button>
            ))}
          </div>
          {data && data.items.length > 0 && (
            <span className="text-xs text-muted-foreground">
              Заморожено{' '}
              <span className="font-semibold text-foreground">
                {formatPrice(totalDeadValue)}
              </span>
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!data || data.items.length === 0}
            onClick={() =>
              api.exporter
                .report('dead-stock', { days })
                .catch((e) => toast.error(String(e)))
            }
          >
            <Download className="mr-2 h-4 w-4" />
            CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading && !data ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isEmpty ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              Всё движется — нет SKU без отгрузок за {days}+ дн.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Товар / SKU</TableHead>
                  <TableHead>Категория</TableHead>
                  <TableHead className="w-28 text-right">Остаток</TableHead>
                  <TableHead className="w-32 text-right">Заморожено</TableHead>
                  <TableHead className="w-36">Последняя отгрузка</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.map((item) => (
                  <TableRow key={item.variantId}>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{item.productName}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.sku}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.categoryName ?? '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQty(item.currentStock)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatPrice(item.deadValue)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-xs',
                        item.lastOutAt
                          ? 'text-muted-foreground'
                          : 'font-medium text-rose-700',
                      )}
                    >
                      {item.lastOutAt ? formatRelative(item.lastOutAt) : 'никогда'}
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

/** "47 дн. назад" — простой относительный формат на сегодня. */
function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  return `${days} ${pluralizeDays(days)} назад`;
}

function pluralizeDays(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'день';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'дня';
  return 'дней';
}
