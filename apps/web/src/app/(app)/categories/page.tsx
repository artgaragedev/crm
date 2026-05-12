'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, type CategoryListItem } from '@/lib/api';
import { pluralize } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
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
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CategoryFormDialog } from './category-form-dialog';

export default function CategoriesPage() {
  const [items, setItems] = useState<CategoryListItem[] | null>(null);
  const [editing, setEditing] = useState<CategoryListItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<CategoryListItem | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await api.categories.list({ pageSize: 200 });
      setItems(res.items);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Не удалось загрузить категории';
      toast.error(msg);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <>
      <PageHeader
        title="Категории"
        description="Группировка товаров. Удаление категории не удаляет товары — у них поле просто очищается."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> Создать
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {items === null ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Пока нет ни одной категории. Создай первую — например «Краски» или «Расходники».
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead className="w-24">Код</TableHead>
                  <TableHead className="w-32">Товаров</TableHead>
                  <TableHead className="w-24 text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <span
                        className="inline-block h-5 w-5 rounded-full border"
                        style={{ background: c.color ?? 'transparent' }}
                        aria-label={c.color ? `Цвет ${c.color}` : 'Без цвета'}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {c.code ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.productCount}</TableCell>
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

      <CategoryFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={() => {
          setCreating(false);
          void reload();
        }}
      />
      <CategoryFormDialog
        category={editing}
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
        title="Удалить категорию?"
        description={
          deleting && (
            <>
              «{deleting.name}»
              {deleting.productCount > 0 && (
                <>
                  {' '}использует {deleting.productCount}{' '}
                  {pluralize(deleting.productCount, 'товар', 'товара', 'товаров')}. Эти товары
                  останутся, но потеряют категорию.
                </>
              )}
            </>
          )
        }
        confirmLabel="Удалить"
        destructive
        onConfirm={async () => {
          if (deleting) await api.categories.remove(deleting.id);
        }}
        onConfirmed={() => {
          toast.success('Категория удалена');
          setDeleting(null);
          void reload();
        }}
      />
    </>
  );
}
