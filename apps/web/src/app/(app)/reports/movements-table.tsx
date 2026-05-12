'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  api,
  ApiError,
  type ReportFilters,
  type ReportMovementsResponse,
} from '@/lib/api';
import { cn, formatDateTime, formatPrice } from '@/lib/utils';
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

const PAGE_SIZE = 50;

interface Props {
  filters: ReportFilters;
}

export function MovementsTable({ filters }: Props) {
  const [data, setData] = useState<ReportMovementsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.reports.movements({ ...filters, page, pageSize: PAGE_SIZE });
      setData(res);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Не удалось загрузить детали';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  // При смене фильтров — на 1-ю страницу.
  useEffect(() => {
    setPage(1);
  }, [filters]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const isEmpty = !loading && data && data.items.length === 0;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">Детальный журнал отгрузок</h3>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-xs text-muted-foreground">
              {data.total} {pluralizeMovements(data.total)} за период
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              api.exporter
                .report('movements', filters)
                .catch((e) => toast.error(String(e)))
            }
            disabled={!data || data.total === 0}
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
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isEmpty ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Нет отгрузок за выбранный период
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Дата/время</TableHead>
                  <TableHead>Товар</TableHead>
                  <TableHead>Клиент</TableHead>
                  <TableHead className="w-24 text-right">Кол-во</TableHead>
                  <TableHead className="w-28 text-right">Цена</TableHead>
                  <TableHead className="w-28 text-right">Выручка</TableHead>
                  <TableHead className="w-28 text-right">Прибыль</TableHead>
                  <TableHead className="w-32 text-muted-foreground">Менеджер</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(m.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{m.variant.productName}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {m.variant.sku}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {m.customer?.name ?? (
                        <span className="text-muted-foreground">—</span>
                      )}
                      {m.discountPercent !== null && m.discountPercent > 0 && (
                        <span className="ml-2 text-xs text-emerald-700">
                          −{m.discountPercent}%
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{m.qty}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.unitPrice === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        formatPrice(m.unitPrice)
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {m.revenue === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        formatPrice(m.revenue)
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        m.profit !== null && m.profit < 0 && 'text-rose-700',
                      )}
                    >
                      {m.profit === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        formatPrice(m.profit)
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {m.user.name}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {data && data.total > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Стр. {page} из {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function pluralizeMovements(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'отгрузка';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'отгрузки';
  return 'отгрузок';
}
