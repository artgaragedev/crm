'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Settings2,
  Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Customer, MovementType, Supplier, Variant } from '@art-garage/shared';
import { api, ApiError, type MovementListItem } from '@/lib/api';
import { formatDateTime, formatSigned } from '@/lib/utils';
import { useAuthStore } from '@/lib/auth-store';
import { AttributesDisplay } from '@/components/attributes-display';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { MovementTypeBadge } from '@/components/movement-type-badge';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MovementSheet } from './movement-sheet';

const PAGE_SIZE = 30;
const ALL_TYPES = '__all__';
const ALL_VARIANTS = '__all__';

const UNIT_LABEL: Record<string, string> = {
  PCS: 'шт',
  KG: 'кг',
  L: 'л',
  M: 'м',
  PACK: 'упак',
};

export default function MovementsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'ADMIN';

  const [typeFilter, setTypeFilter] = useState<string>(ALL_TYPES);
  const [variantFilter, setVariantFilter] = useState<string>(ALL_VARIANTS);
  const [showReversed, setShowReversed] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: MovementListItem[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const [variants, setVariants] = useState<Variant[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [creatingType, setCreatingType] = useState<MovementType | null>(null);
  const [reversing, setReversing] = useState<MovementListItem | null>(null);

  const loadVariants = useCallback(async () => {
    try {
      const res = await api.variants.list({ pageSize: 500 });
      setVariants(res.items);
    } catch {
      // не критично
    }
  }, []);

  const loadDirectories = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        api.suppliers.list({ pageSize: 500 }),
        api.customers.list({ pageSize: 500 }),
      ]);
      setSuppliers(s.items);
      setCustomers(c.items);
    } catch {
      // не критично — форма движения покажет пустой список
    }
  }, []);

  const loadMovements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.movements.list({
        page,
        pageSize: PAGE_SIZE,
        type: typeFilter === ALL_TYPES ? undefined : (typeFilter as MovementType),
        variantId: variantFilter === ALL_VARIANTS ? undefined : variantFilter,
        includeReversed: showReversed,
      });
      setData({ items: res.items, total: res.total });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Не удалось загрузить движения';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, variantFilter, showReversed]);

  useEffect(() => {
    setPage(1);
  }, [typeFilter, variantFilter, showReversed]);

  useEffect(() => {
    void loadMovements();
  }, [loadMovements]);

  useEffect(() => {
    void loadVariants();
    void loadDirectories();
  }, [loadVariants, loadDirectories]);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  }, [data]);

  const isEmpty = data && data.items.length === 0;

  const reload = () => {
    void loadMovements();
    void loadVariants(); // после движения — остатки изменились
  };

  /** Знаковое отображение количества: IN +qty, OUT -qty, ADJUST signed. */
  const signedQuantity = (m: MovementListItem) => {
    if (m.type === 'OUT') return -Math.abs(m.quantity);
    if (m.type === 'ADJUST') return m.quantity;
    return Math.abs(m.quantity);
  };

  return (
    <>
      <PageHeader
        title="Движения"
        description="Журнал всех приходов, списаний и корректировок. Append-only — ошибки отменяются сторно."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setCreatingType('IN')} variant="default">
              <ArrowDownToLine className="mr-2 h-4 w-4" /> Приход
            </Button>
            <Button onClick={() => setCreatingType('OUT')} variant="outline">
              <ArrowUpFromLine className="mr-2 h-4 w-4" /> Списание
            </Button>
            <Button onClick={() => setCreatingType('ADJUST')} variant="outline">
              <Settings2 className="mr-2 h-4 w-4" /> Корректировка
            </Button>
            <Button
              variant="ghost"
              onClick={() => api.exporter.download('movements').catch((e) => toast.error(String(e)))}
              aria-label="Экспорт CSV"
            >
              <Download className="mr-2 h-4 w-4" /> Экспорт
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TYPES}>Все типы</SelectItem>
            <SelectItem value="IN">Только приходы</SelectItem>
            <SelectItem value="OUT">Только списания</SelectItem>
            <SelectItem value="ADJUST">Только корректировки</SelectItem>
          </SelectContent>
        </Select>
        <Select value={variantFilter} onValueChange={setVariantFilter}>
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue placeholder="Все вариации" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VARIANTS}>Все вариации</SelectItem>
            {variants.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.product?.name} · {v.sku}
                {v.attributes.color ? ` · ${v.attributes.color}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={showReversed ? 'secondary' : 'outline'}
          onClick={() => setShowReversed((v) => !v)}
          className="w-full sm:w-auto"
          title="Отменённые движения и сторно скрыты по умолчанию"
        >
          {showReversed ? (
            <EyeOff className="mr-2 h-4 w-4" />
          ) : (
            <Eye className="mr-2 h-4 w-4" />
          )}
          {showReversed ? 'Скрыть отменённые' : 'Показать отменённые'}
        </Button>
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
              {typeFilter !== ALL_TYPES || variantFilter !== ALL_VARIANTS
                ? 'Ничего не найдено по фильтрам.'
                : 'Журнал движений пуст. Создай первый приход.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Дата/время</TableHead>
                  <TableHead className="w-24">Тип</TableHead>
                  <TableHead>Вариация</TableHead>
                  <TableHead className="w-28 text-right">Кол-во</TableHead>
                  <TableHead>Контрагент</TableHead>
                  <TableHead>Заметка</TableHead>
                  <TableHead className="w-32">Кто</TableHead>
                  {isAdmin && <TableHead className="w-12 text-right"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.map((m) => {
                  const unit = UNIT_LABEL[m.variant.product.unit] ?? '';
                  const counterparty = m.supplier?.name ?? m.customer?.name ?? null;
                  // Это аннулированный оригинал? (сторно-движение или то, на что есть сторно)
                  const isAnnulled = !!m.reversedBy || !!m.reversesId;
                  return (
                    <TableRow key={m.id} className={isAnnulled ? 'opacity-60' : ''}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(m.createdAt)}
                      </TableCell>
                      <TableCell>
                        <MovementTypeBadge type={m.type} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{m.variant.product.name}</span>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono">{m.variant.sku}</span>
                            {Object.keys(m.variant.attributes).length > 0 && (
                              <AttributesDisplay attributes={m.variant.attributes} inline />
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        <span
                          className={`${
                            signedQuantity(m) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          } ${isAnnulled ? 'line-through' : ''}`}
                        >
                          {formatSigned(signedQuantity(m), unit)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {counterparty ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="max-w-[16rem] truncate text-sm text-muted-foreground">
                        {m.note ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.user.name}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <div className="flex justify-end">
                            {m.reversesId ? (
                              <span className="text-xs text-muted-foreground">сторно</span>
                            ) : m.reversedBy ? (
                              <span
                                className="text-xs text-muted-foreground"
                                title={`Сторнировано ${formatDateTime(m.reversedBy.createdAt)}`}
                              >
                                отменено
                              </span>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setReversing(m)}
                                aria-label="Сторнировать"
                                title="Сторнировать (создать обратное движение)"
                              >
                                <Undo2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {data && data.total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Стр. {page} из {totalPages} · {data.total} всего
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

      <MovementSheet
        type={creatingType}
        onClose={() => setCreatingType(null)}
        variants={variants}
        suppliers={suppliers}
        customers={customers}
        onSaved={() => {
          setCreatingType(null);
          reload();
        }}
      />

      <ConfirmDialog
        open={!!reversing}
        onOpenChange={(v) => !v && setReversing(null)}
        title="Сторнировать движение?"
        description={
          reversing && (
            <>
              Будет создано обратное движение к {reversing.type === 'IN' ? 'приходу' : reversing.type === 'OUT' ? 'списанию' : 'корректировке'} {Math.abs(reversing.quantity)} шт.{' '}
              Оригинал останется в журнале — это правильный способ "отменить" по бухучёту.
            </>
          )
        }
        confirmLabel="Сторнировать"
        onConfirm={async () => {
          if (reversing) await api.movements.reverse(reversing.id);
        }}
        onConfirmed={() => {
          toast.success('Движение сторнировано');
          setReversing(null);
          reload();
        }}
      />
    </>
  );
}
