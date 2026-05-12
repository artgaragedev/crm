'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Customer } from '@art-garage/shared';
import { api, ApiError } from '@/lib/api';
import { useDebounced } from '@/hooks/use-debounced';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CustomerFormDialog } from './customer-form-dialog';

const PAGE_SIZE = 25;

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 300);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Customer[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.customers.list({
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch || undefined,
      });
      setData({ items: res.items, total: res.total });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Не удалось загрузить клиентов';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  }, [data]);

  const isEmpty = data && data.items.length === 0;

  return (
    <>
      <PageHeader
        title="Клиенты"
        description="Списания товаров привязываются к клиентам."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> Создать
          </Button>
        }
      />

      <div className="mb-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Поиск по имени"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
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
              {debouncedSearch
                ? 'Ничего не найдено.'
                : 'Пока нет ни одного клиента. Создай первого.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Имя</TableHead>
                  <TableHead className="w-44">Телефон</TableHead>
                  <TableHead className="w-56">Email</TableHead>
                  <TableHead className="w-24 text-right">Скидка</TableHead>
                  <TableHead>Заметка</TableHead>
                  <TableHead className="w-24 text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.phone ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.discountPercent > 0 ? (
                        <span className="font-medium text-emerald-700">
                          {c.discountPercent}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-md truncate text-muted-foreground">
                      {c.note ?? '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditing(c)}
                          aria-label="Редактировать"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleting(c)}
                          aria-label="Удалить"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
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

      <CustomerFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={() => {
          setCreating(false);
          void reload();
        }}
      />
      <CustomerFormDialog
        customer={editing}
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void reload();
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Удалить клиента?"
        description={
          deleting && (
            <>
              «{deleting.name}». Прошлые списания на этого клиента сохранятся в журнале — у них
              просто очистится ссылка.
            </>
          )
        }
        confirmLabel="Удалить"
        destructive
        onConfirm={async () => {
          if (deleting) await api.customers.remove(deleting.id);
        }}
        onConfirmed={() => {
          toast.success('Клиент удалён');
          setDeleting(null);
          void reload();
        }}
      />
    </>
  );
}
