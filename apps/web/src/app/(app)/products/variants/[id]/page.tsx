'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Package, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { Variant } from '@art-garage/shared';
import { api, ApiError, type MovementListItem, type VariantLot } from '@/lib/api';
import { formatDateTime, formatPrice } from '@/lib/utils';
import { AttributesDisplay } from '@/components/attributes-display';
import { CategoryChip } from '@/components/category-chip';
import { MovementTypeBadge } from '@/components/movement-type-badge';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LotEditDialog } from './lot-edit-dialog';

const UNIT_LABEL: Record<string, string> = {
  PCS: 'шт',
  KG: 'кг',
  L: 'л',
  M: 'м',
  PACK: 'упак',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function VariantDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const [variant, setVariant] = useState<Variant | null>(null);
  const [lots, setLots] = useState<VariantLot[] | null>(null);
  const [movements, setMovements] = useState<MovementListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingLot, setEditingLot] = useState<VariantLot | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [v, l, m] = await Promise.all([
        api.variants.findOne(id),
        api.variants.lots(id),
        api.movements.list({ variantId: id, pageSize: 200 }),
      ]);
      setVariant(v);
      setLots(l);
      setMovements(m.items);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Не удалось загрузить вариацию';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !variant) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const unit = variant.product ? UNIT_LABEL[variant.product.unit] ?? '' : '';
  const activeLots = (lots ?? []).filter((l) => l.remainingQuantity > 0.001);
  const inventoryCost = activeLots.reduce(
    (s, l) => s + l.remainingQuantity * l.unitCost,
    0,
  );
  const inventoryRetail =
    variant.price !== null && variant.price !== undefined
      ? variant.currentStock * variant.price
      : null;

  return (
    <>
      <div className="mb-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/products">
            <ArrowLeft className="mr-2 h-4 w-4" /> К товарам
          </Link>
        </Button>
      </div>
      <PageHeader
        title={variant.product?.name ?? '—'}
        description={
          <span className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-mono">SKU: {variant.sku}</span>
            {variant.product?.category && (
              <>
                <span>·</span>
                <CategoryChip category={variant.product.category} />
              </>
            )}
            {Object.keys(variant.attributes).length > 0 && (
              <>
                <span>·</span>
                <AttributesDisplay attributes={variant.attributes} inline />
              </>
            )}
          </span>
        }
      />

      {/* KPI */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Текущий остаток
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {variant.currentStock} {unit}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeLots.length}{' '}
              {activeLots.length === 1
                ? 'активная партия'
                : activeLots.length >= 2 && activeLots.length <= 4
                  ? 'активные партии'
                  : 'активных партий'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Себестоимость остатка
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{formatPrice(inventoryCost)}</p>
            <p className="mt-1 text-xs text-muted-foreground">по партиям (FIFO)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Розничная стоимость
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {inventoryRetail !== null ? formatPrice(inventoryRetail) : '—'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {variant.price !== null
                ? `по продажной ${formatPrice(variant.price)}`
                : 'продажная цена не задана'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Партии */}
      <div className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">Партии (lots)</h2>
        <Card>
          <CardContent className="p-0">
            {(lots ?? []).length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
                <Package className="h-6 w-6 opacity-50" />
                Партий пока нет — поступлений не было.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">Дата прихода</TableHead>
                    <TableHead>Поставщик</TableHead>
                    <TableHead className="w-28 text-right">Закупка</TableHead>
                    <TableHead className="w-28 text-right">Изначально</TableHead>
                    <TableHead className="w-28 text-right">Остаток</TableHead>
                    <TableHead className="w-32 text-right">Себестоимость остатка</TableHead>
                    <TableHead>Заметка</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(lots ?? [])
                    .slice()
                    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
                    .map((l) => {
                      const isExhausted = l.remainingQuantity <= 0.001;
                      const isDeficit = l.remainingQuantity < -0.001;
                      const remainingValue = l.remainingQuantity * l.unitCost;
                      return (
                        <TableRow key={l.id} className={isExhausted ? 'opacity-60' : ''}>
                          <TableCell className="whitespace-nowrap text-xs">
                            {formatDateTime(l.receivedAt)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {l.supplier?.name ?? <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatPrice(l.unitCost)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {l.initialQuantity} {unit}
                          </TableCell>
                          <TableCell
                            className={`text-right font-medium tabular-nums ${
                              isDeficit
                                ? 'text-rose-700'
                                : isExhausted
                                  ? 'text-muted-foreground'
                                  : ''
                            }`}
                          >
                            {l.remainingQuantity} {unit}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatPrice(remainingValue > 0 ? remainingValue : 0)}
                          </TableCell>
                          <TableCell className="max-w-[20rem] truncate text-xs text-muted-foreground">
                            {l.note ?? '—'}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditingLot(l)}
                              aria-label="Редактировать партию"
                              title="Редактировать цену/заметку"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* История движений */}
      <div className="mt-6">
        <h2 className="mb-3 text-lg font-semibold">История движений</h2>
        <Card>
          <CardContent className="p-0">
            {(movements ?? []).length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Движений по этой вариации не было.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">Дата/время</TableHead>
                    <TableHead className="w-24">Тип</TableHead>
                    <TableHead className="w-24 text-right">Кол-во</TableHead>
                    <TableHead className="w-32 text-right">Себестоимость</TableHead>
                    <TableHead>Контрагент</TableHead>
                    <TableHead>Заметка</TableHead>
                    <TableHead className="w-32">Кто</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(movements ?? []).map((m) => {
                    const signedQ =
                      m.type === 'OUT' ? -Math.abs(m.quantity) : m.quantity;
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(m.createdAt)}
                        </TableCell>
                        <TableCell>
                          <MovementTypeBadge type={m.type} />
                        </TableCell>
                        <TableCell
                          className={`text-right font-medium tabular-nums ${
                            signedQ >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {signedQ >= 0 ? `+${signedQ}` : signedQ} {unit}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {m.totalCost !== null && m.totalCost !== undefined
                            ? formatPrice(m.totalCost)
                            : '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {m.supplier?.name ?? m.customer?.name ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-md truncate text-xs text-muted-foreground">
                          {m.note ?? '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.user.name}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <LotEditDialog
        lot={editingLot}
        onOpenChange={(v) => !v && setEditingLot(null)}
        onSaved={() => {
          setEditingLot(null);
          void load();
        }}
      />
    </>
  );
}
