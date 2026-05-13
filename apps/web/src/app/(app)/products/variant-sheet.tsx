'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ExternalLink, Package, Pencil, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AttributeDto, Variant } from '@art-garage/shared';
import { api, ApiError, type MovementListItem, type VariantLot } from '@/lib/api';
import { formatDateTime, formatPrice, formatSigned } from '@/lib/utils';
import { buildVariantSku } from '@/lib/sku';
import { AttributesDisplay } from '@/components/attributes-display';
import { CategoryChip } from '@/components/category-chip';
import { MovementTypeBadge } from '@/components/movement-type-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LotEditDialog } from './variants/[id]/lot-edit-dialog';

const UNIT_LABEL: Record<string, string> = {
  PCS: 'шт',
  KG: 'кг',
  L: 'л',
  M: 'м',
  PACK: 'упак',
};

const formSchema = z.object({
  sku: z.string().trim().min(1, 'SKU обязателен').max(64),
  price: z
    .string()
    .optional()
    .refine((v) => !v || /^\d+([.,]\d{1,2})?$/.test(v), 'Цена 199.99 / 199,99'),
  reorderLevel: z
    .string()
    .optional()
    .refine((v) => !v || /^\d+$/.test(v), 'Порог должен быть целым числом'),
});
type FormValues = z.infer<typeof formSchema>;

interface Props {
  variant: Variant | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

export function VariantSheet({ variant, onOpenChange, onSaved }: Props) {
  const open = !!variant;
  const [lots, setLots] = useState<VariantLot[] | null>(null);
  const [movements, setMovements] = useState<MovementListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingLot, setEditingLot] = useState<VariantLot | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { sku: '', price: '', reorderLevel: '' },
  });

  // ── Реляционные атрибуты ────────────────────────────────────────────────
  // attributeValues приходит с сервера: список { attributeId, attributeValueId, attribute, value }.
  // Для UI редактирования нам нужен ВЕСЬ список значений каждой оси — подгружаем справочник.
  const [allAttributes, setAllAttributes] = useState<AttributeDto[] | null>(null);
  const [selectedValueByAxis, setSelectedValueByAxis] = useState<Record<string, string>>({});
  const [valuesDirty, setValuesDirty] = useState(false);

  useEffect(() => {
    if (!variant) return;
    api.attributes
      .list({ pageSize: 200 })
      .then((res) => setAllAttributes(res.items))
      .catch(() => {
        // не блокируем основной flow — справочник опционально нужен только для select'ов
      });
  }, [variant]);

  const axisDescriptors = useMemo(() => {
    if (!variant || !allAttributes) return [];
    // Какие оси у этого варианта (через attributeValues), в их же порядке.
    return (variant.attributeValues ?? []).map((av) => {
      const fullAttr = allAttributes.find((a) => a.id === av.attributeId);
      return {
        attributeId: av.attributeId,
        attribute: av.attribute ?? null,
        // Все возможные значения этой оси — из справочника (для select'a).
        values: fullAttr?.values ?? (av.value ? [av.value] : []),
      };
    });
  }, [variant, allAttributes]);

  const handleGenerateSku = () => {
    if (!variant?.product?.code) {
      toast.error('У товара нет артикула');
      return;
    }
    // Хвосты SKU — коды текущих значений по осям, в порядке axisDescriptors.
    const parts = axisDescriptors.map((axis) => {
      const selectedId = selectedValueByAxis[axis.attributeId];
      const v = axis.values.find((x) => x.id === selectedId);
      return v?.code ?? v?.value ?? '';
    });
    setValue(
      'sku',
      buildVariantSku(variant.product.code, parts),
      { shouldDirty: true },
    );
  };

  // Reset на открытие
  useEffect(() => {
    if (variant) {
      reset({
        sku: variant.sku,
        price:
          variant.price !== null && variant.price !== undefined ? String(variant.price) : '',
        reorderLevel:
          variant.reorderLevel !== null && variant.reorderLevel !== undefined
            ? String(variant.reorderLevel)
            : '',
      });
      const map: Record<string, string> = {};
      for (const av of variant.attributeValues ?? []) {
        map[av.attributeId] = av.attributeValueId;
      }
      setSelectedValueByAxis(map);
      setValuesDirty(false);
    }
  }, [variant, reset]);

  // Подгрузка партий и движений
  useEffect(() => {
    if (!variant) {
      setLots(null);
      setMovements(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.variants.lots(variant.id),
      api.movements.list({ variantId: variant.id, pageSize: 100 }),
    ])
      .then(([l, m]) => {
        if (cancelled) return;
        setLots(l);
        setMovements(m.items);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof ApiError ? err.message : 'Не удалось загрузить данные';
        toast.error(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [variant]);

  const reloadLots = async () => {
    if (!variant) return;
    try {
      const l = await api.variants.lots(variant.id);
      setLots(l);
    } catch {
      // silent
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (!variant) return;
    setSubmitting(true);

    // Если значения по осям меняли — шлём реляционный массив, сервер пересинхронит JSON snapshot.
    // Иначе вообще не трогаем атрибуты в запросе.
    const attributeValues = valuesDirty
      ? axisDescriptors
          .map((axis) => ({
            attributeId: axis.attributeId,
            attributeValueId: selectedValueByAxis[axis.attributeId] ?? '',
          }))
          .filter((r) => r.attributeValueId)
      : undefined;

    try {
      await api.variants.update(variant.id, {
        sku: values.sku.trim(),
        ...(attributeValues ? { attributeValues } : {}),
        price: values.price ? Number(values.price.replace(',', '.')) : null,
        reorderLevel: values.reorderLevel ? Number(values.reorderLevel) : null,
      });
      toast.success('Вариация обновлена');
      onSaved();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Не удалось сохранить';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const unit = variant?.product ? UNIT_LABEL[variant.product.unit] ?? '' : '';
  const activeLots = useMemo(
    () => (lots ?? []).filter((l) => l.remainingQuantity > 0.001),
    [lots],
  );
  const inventoryCost = useMemo(
    () => activeLots.reduce((s, l) => s + l.remainingQuantity * l.unitCost, 0),
    [activeLots],
  );
  const inventoryRetail =
    variant && variant.price !== null && variant.price !== undefined
      ? variant.currentStock * variant.price
      : null;

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onOpenChange(false)}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-none md:w-[760px] lg:w-[860px]"
        >
          <SheetHeader className="flex-row items-start gap-3 border-b p-6">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-xl">
                {variant?.product?.name ?? '—'}
              </SheetTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">SKU: {variant?.sku}</span>
                {variant?.product?.category && (
                  <>
                    <span>·</span>
                    <CategoryChip category={variant.product.category} />
                  </>
                )}
                {variant && Object.keys(variant.attributes).length > 0 && (
                  <>
                    <span>·</span>
                    <AttributesDisplay attributes={variant.attributes} inline />
                  </>
                )}
              </div>
            </div>
            {variant && (
              <Button asChild variant="ghost" size="icon" className="shrink-0" title="Открыть на отдельной странице">
                <Link href={`/products/variants/${variant.id}`} target="_blank">
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            {/* Форма редактирования */}
            <form onSubmit={handleSubmit(onSubmit)} className="border-b p-6">
              <h3 className="mb-3 text-sm font-semibold">Редактировать</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sku">SKU</Label>
                  <div className="flex gap-1">
                    <Input id="sku" className="font-mono" {...register('sku')} />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleGenerateSku}
                      title="Сгенерировать из имени и цвета"
                      aria-label="Сгенерировать SKU"
                    >
                      <Wand2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {errors.sku && (
                    <p className="text-xs text-destructive">{errors.sku.message}</p>
                  )}
                </div>
                {axisDescriptors.map((axis) => {
                  const attr = axis.attribute;
                  const selectedId = selectedValueByAxis[axis.attributeId];
                  return (
                    <div key={axis.attributeId} className="space-y-1.5">
                      <Label htmlFor={`axis-${axis.attributeId}`}>
                        {attr?.name ?? axis.attributeId}
                      </Label>
                      <Select
                        value={selectedId ?? ''}
                        onValueChange={(v) => {
                          setSelectedValueByAxis((prev) => ({
                            ...prev,
                            [axis.attributeId]: v,
                          }));
                          setValuesDirty(true);
                        }}
                      >
                        <SelectTrigger id={`axis-${axis.attributeId}`}>
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {axis.values.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              <span className="flex items-center gap-2">
                                {attr?.type === 'SWATCH' && v.swatch && (
                                  <span
                                    className="h-3 w-3 rounded-full border"
                                    style={{ background: v.swatch }}
                                  />
                                )}
                                {v.label ?? v.value}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
                <div className="space-y-1.5">
                  <Label htmlFor="price">Цена (продажная)</Label>
                  <Input id="price" inputMode="decimal" {...register('price')} />
                  {errors.price && (
                    <p className="text-xs text-destructive">{errors.price.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reorderLevel">Порог низкого остатка</Label>
                  <Input
                    id="reorderLevel"
                    inputMode="numeric"
                    placeholder="дефолт 5"
                    {...register('reorderLevel')}
                  />
                  {errors.reorderLevel && (
                    <p className="text-xs text-destructive">{errors.reorderLevel.message}</p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Закрыть
                </Button>
                <Button type="submit" disabled={submitting || (!isDirty && !valuesDirty)}>
                  {submitting ? 'Сохраняю…' : 'Сохранить'}
                </Button>
              </div>
            </form>

            {/* KPI */}
            {variant && (
              <div className="grid grid-cols-3 divide-x border-b">
                <div className="p-4">
                  <p className="text-xs font-medium text-muted-foreground">Остаток</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {variant.currentStock} {unit}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {activeLots.length}{' '}
                    {activeLots.length === 1
                      ? 'партия'
                      : activeLots.length >= 2 && activeLots.length <= 4
                        ? 'партии'
                        : 'партий'}
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-xs font-medium text-muted-foreground">Себестоимость</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {formatPrice(inventoryCost)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">по партиям</p>
                </div>
                <div className="p-4">
                  <p className="text-xs font-medium text-muted-foreground">Розница</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {inventoryRetail !== null ? formatPrice(inventoryRetail) : '—'}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">по продажной</p>
                </div>
              </div>
            )}

            {/* Партии */}
            <section className="border-b">
              <div className="flex items-center justify-between px-6 py-3">
                <h3 className="text-sm font-semibold">Партии (приходы)</h3>
                <span className="text-xs text-muted-foreground">
                  {lots ? `${lots.length}` : ''}
                </span>
              </div>
              {loading && !lots ? (
                <div className="space-y-2 px-6 pb-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (lots ?? []).length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                  Партий пока нет.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Дата</TableHead>
                      <TableHead>Поставщик</TableHead>
                      <TableHead className="w-24 text-right">Закупка</TableHead>
                      <TableHead className="w-24 text-right">Изн.</TableHead>
                      <TableHead className="w-24 text-right">Остаток</TableHead>
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
                        return (
                          <TableRow key={l.id} className={isExhausted ? 'opacity-60' : ''}>
                            <TableCell className="whitespace-nowrap text-xs">
                              {formatDateTime(l.receivedAt).slice(0, 10)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {l.supplier?.name ?? (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatPrice(l.unitCost)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {l.initialQuantity}
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
                              {l.remainingQuantity}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setEditingLot(l)}
                                aria-label="Редактировать партию"
                                title="Изменить цену/заметку партии"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              )}
            </section>

            {/* Движения */}
            <section>
              <div className="flex items-center justify-between px-6 py-3">
                <h3 className="text-sm font-semibold">История движений</h3>
                <span className="text-xs text-muted-foreground">
                  {movements ? `${movements.length}` : ''}
                </span>
              </div>
              {loading && !movements ? (
                <div className="space-y-2 px-6 pb-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (movements ?? []).length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-muted-foreground">
                  Движений не было.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Дата</TableHead>
                      <TableHead className="w-20">Тип</TableHead>
                      <TableHead className="w-24 text-right">Кол-во</TableHead>
                      <TableHead>Контрагент</TableHead>
                      <TableHead className="w-24 text-right">Себест.</TableHead>
                      <TableHead>Заметка</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(movements ?? []).map((m) => {
                      const signed =
                        m.type === 'OUT'
                          ? -Math.abs(m.quantity)
                          : m.type === 'IN'
                            ? Math.abs(m.quantity)
                            : m.quantity;
                      const isAnnulled = !!m.reversedBy || !!m.reversesId;
                      return (
                        <TableRow key={m.id} className={isAnnulled ? 'opacity-60' : ''}>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatDateTime(m.createdAt).slice(0, 10)}
                          </TableCell>
                          <TableCell>
                            <MovementTypeBadge type={m.type} />
                          </TableCell>
                          <TableCell
                            className={`text-right font-medium tabular-nums ${
                              signed >= 0 ? 'text-emerald-700' : 'text-rose-700'
                            } ${isAnnulled ? 'line-through' : ''}`}
                          >
                            {formatSigned(signed, unit)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {m.supplier?.name ?? m.customer?.name ?? (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {m.totalCost !== null && m.totalCost !== undefined
                              ? formatPrice(m.totalCost)
                              : '—'}
                          </TableCell>
                          <TableCell className="max-w-[14rem] truncate text-xs text-muted-foreground">
                            {m.reversedBy && (
                              <span className="mr-1 rounded bg-muted px-1 py-0.5 text-[10px] uppercase">
                                отменено
                              </span>
                            )}
                            {m.reversesId && (
                              <span className="mr-1 rounded bg-muted px-1 py-0.5 text-[10px] uppercase">
                                сторно
                              </span>
                            )}
                            {m.note ?? ''}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </section>
          </div>
        </SheetContent>
      </Sheet>

      <LotEditDialog
        lot={editingLot}
        onOpenChange={(v) => !v && setEditingLot(null)}
        onSaved={() => {
          setEditingLot(null);
          void reloadLots();
        }}
      />
    </>
  );
}
