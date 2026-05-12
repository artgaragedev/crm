'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ProductUnit, Variant } from '@art-garage/shared';
import { api, ApiError, type CategoryListItem } from '@/lib/api';
import { formatPrice } from '@/lib/utils';
import { useDebounced } from '@/hooks/use-debounced';
import { AttributesDisplay } from '@/components/attributes-display';
import { CategoryChip } from '@/components/category-chip';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { VariantCreateDialog } from './variant-create-dialog';
import { VariantSheet } from './variant-sheet';
import { ImportDialog } from './import-dialog';

const PAGE_SIZE = 25;
const ALL_CATEGORIES = '__all__';

const UNIT_LABEL: Record<ProductUnit, string> = {
  PCS: 'шт',
  KG: 'кг',
  L: 'л',
  M: 'м',
  PACK: 'упак',
};

export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 300);
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_CATEGORIES);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Variant[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategoryListItem[]>([]);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Variant | null>(null);
  const [deleting, setDeleting] = useState<Variant | null>(null);
  const [importing, setImporting] = useState(false);

  const loadCategories = useCallback(async () => {
    try {
      const res = await api.categories.list({ pageSize: 200 });
      setCategories(res.items);
    } catch {
      // не критично
    }
  }, []);

  const loadVariants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.variants.list({
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch || undefined,
        categoryId: categoryFilter === ALL_CATEGORIES ? undefined : categoryFilter,
      });
      setData({ items: res.items, total: res.total });
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Не удалось загрузить товары';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, categoryFilter]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoryFilter]);

  useEffect(() => {
    void loadVariants();
  }, [loadVariants]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  }, [data]);

  const isEmpty = data && data.items.length === 0;

  const reload = () => {
    void loadVariants();
    void loadCategories();
  };

  return (
    <>
      <PageHeader
        title="Товары"
        description="Каждая строка — вариация (свой SKU, цена, остаток). Один товар может иметь несколько вариаций (цвет, размер и т.д.)."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> Создать
            </Button>
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload className="mr-2 h-4 w-4" /> Импорт
            </Button>
            <Button
              variant="ghost"
              onClick={() => api.exporter.download('inventory').catch((e) => toast.error(String(e)))}
            >
              <Download className="mr-2 h-4 w-4" /> Экспорт
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Поиск по названию или SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Все категории" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>Все категории</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
              {debouncedSearch || categoryFilter !== ALL_CATEGORIES
                ? 'Ничего не найдено по фильтрам.'
                : 'Пока нет ни одного товара. Создай первый — например «BOTTLE COLBY».'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Товар</TableHead>
                  <TableHead>Категория</TableHead>
                  <TableHead>Атрибуты</TableHead>
                  <TableHead className="w-28">Артикул</TableHead>
                  <TableHead className="w-40">SKU вариации</TableHead>
                  <TableHead className="w-28 text-right">Цена</TableHead>
                  <TableHead className="w-28 text-right">Остаток</TableHead>
                  <TableHead className="w-24 text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.items.map((v) => (
                  <TableRow
                    key={v.id}
                    className="cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => setEditing(v)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setEditing(v);
                      }
                    }}
                  >
                    <TableCell className="font-medium">{v.product?.name}</TableCell>
                    <TableCell>
                      <CategoryChip category={v.product?.category ?? null} />
                    </TableCell>
                    <TableCell>
                      <AttributesDisplay attributes={v.attributes} inline />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {v.product?.code ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{v.sku}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPrice(v.price)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {v.currentStock} {v.product ? UNIT_LABEL[v.product.unit] : ''}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleting(v);
                          }}
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

      <ImportDialog
        open={importing}
        onOpenChange={setImporting}
        onImported={() => reload()}
      />

      <VariantCreateDialog
        open={creating}
        onOpenChange={setCreating}
        categories={categories}
        onSaved={() => {
          setCreating(false);
          reload();
        }}
      />
      <VariantSheet
        variant={editing}
        onOpenChange={(v) => !v && setEditing(null)}
        onSaved={() => {
          // не закрываем sheet — пользователь может продолжить смотреть
          reload();
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title="Удалить вариацию?"
        description={
          deleting && (
            <>
              «{deleting.product?.name}» / {deleting.sku}
              {deleting.currentStock !== 0 && (
                <>
                  {' '}— на складе сейчас {deleting.currentStock}{' '}
                  {deleting.product ? UNIT_LABEL[deleting.product.unit] : ''}.
                </>
              )}
              {deleting.product?.variantCount === 1 && (
                <>
                  {' '}Это единственная вариация — товар «{deleting.product.name}» тоже удалится.
                </>
              )}
            </>
          )
        }
        confirmLabel="Удалить"
        destructive
        onConfirm={async () => {
          if (deleting) {
            await api.variants.remove(deleting.id, {
              cascadeProduct: deleting.product?.variantCount === 1,
            });
          }
        }}
        onConfirmed={() => {
          toast.success('Вариация удалена');
          setDeleting(null);
          reload();
        }}
      />
    </>
  );
}
