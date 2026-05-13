'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Wand2 } from 'lucide-react';
import { productUnitSchema, type Product, type ProductUnit } from '@art-garage/shared';
import { api, ApiError, type CategoryListItem } from '@/lib/api';
import { buildSkuCandidate, buildVariantSku } from '@/lib/sku';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const NO_CATEGORY = '__none__';

const UNIT_LABEL: Record<ProductUnit, string> = {
  PCS: 'шт.',
  KG: 'кг',
  L: 'л',
  M: 'м',
  PACK: 'упак.',
};

type Mode = 'new' | 'existing';

const baseVariant = {
  /** Пустой SKU допустим — сервер сгенерирует. */
  sku: z.string().trim().max(64).optional(),
  color: z.string().trim().max(50).optional(),
  price: z
    .string()
    .optional()
    .refine((v) => !v || /^\d+([.,]\d{1,2})?$/.test(v), 'Цена 199.99 или 199,99'),
};

const newProductSchema = z.object({
  mode: z.literal('new'),
  productName: z.string().trim().min(1, 'Введи название товара').max(200),
  unit: productUnitSchema,
  categoryId: z.string(),
  description: z.string().max(2000).optional(),
  ...baseVariant,
});

const existingProductSchema = z.object({
  mode: z.literal('existing'),
  productId: z.string().min(1, 'Выбери товар'),
  ...baseVariant,
});

const formSchema = z.discriminatedUnion('mode', [newProductSchema, existingProductSchema]);
type FormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: CategoryListItem[];
  onSaved: () => void;
}

export function VariantCreateDialog({ open, onOpenChange, categories, onSaved }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<Mode>('new');
  const [products, setProducts] = useState<Product[]>([]);
  /** Юзер сам редактировал SKU — перестаём авто-обновлять. Пока false — SKU живой preview. */
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mode: 'new',
      productName: '',
      unit: 'PCS',
      categoryId: NO_CATEGORY,
      description: '',
      sku: '',
      color: '',
      price: '',
    },
  });

  const formMode = watch('mode');
  const unit = formMode === 'new' ? watch('unit') : undefined;
  const categoryId = formMode === 'new' ? watch('categoryId') : undefined;
  const productId = formMode === 'existing' ? watch('productId') : undefined;
  const productNameField = formMode === 'new' ? watch('productName') : undefined;
  const colorField = watch('color');

  /** Чистый расчёт SKU из текущего состояния формы. Возвращает '' если ещё нечего считать. */
  const computeSkuPreview = (): string => {
    if (formMode === 'existing') {
      const p = products.find((pp) => pp.id === productId);
      if (!p?.code) return '';
      return buildVariantSku(p.code, [colorField?.trim()]);
    }
    const productName = (productNameField ?? '').trim();
    if (!productName) return '';
    const cat = categories.find((c) => c.id === categoryId);
    const seq = cat?.nextProductSeq ?? 1;
    return buildSkuCandidate(
      productName,
      [colorField?.trim()],
      cat?.code ?? null,
      seq,
    );
  };

  const handleGenerateSku = () => {
    const candidate = computeSkuPreview();
    if (!candidate) {
      toast.error(
        formMode === 'existing'
          ? 'Сначала выбери товар'
          : 'Сначала укажи название товара',
      );
      return;
    }
    setValue('sku', candidate, { shouldDirty: true });
    setSkuManuallyEdited(false); // вернули в авто-режим
  };

  // Auto-update SKU когда меняются связанные поля и юзер ещё не редактировал вручную.
  useEffect(() => {
    if (skuManuallyEdited) return;
    if (!open) return;
    const candidate = computeSkuPreview();
    if (candidate) setValue('sku', candidate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    skuManuallyEdited,
    formMode,
    productId,
    productNameField,
    categoryId,
    colorField,
    products,
    categories,
  ]);

  // Сброс при открытии.
  useEffect(() => {
    if (open) {
      setMode('new');
      setSkuManuallyEdited(false);
      reset({
        mode: 'new',
        productName: '',
        unit: 'PCS',
        categoryId: NO_CATEGORY,
        description: '',
        sku: '',
        color: '',
        price: '',
      });
    }
  }, [open, reset]);

  // Загрузка списка товаров для режима "существующий".
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api.products
      .list({ pageSize: 500 })
      .then((res) => {
        if (!cancelled) setProducts(res.items);
      })
      .catch(() => {
        // не критично
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setSkuManuallyEdited(false);
    if (m === 'new') {
      reset({
        mode: 'new',
        productName: '',
        unit: 'PCS',
        categoryId: NO_CATEGORY,
        description: '',
        sku: '',
        color: '',
        price: '',
      });
    } else {
      reset({
        mode: 'existing',
        productId: '',
        sku: '',
        color: '',
        price: '',
      });
    }
  };

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    const attributes: Record<string, string> = {};
    if (values.color?.trim()) attributes.color = values.color.trim();

    const price = values.price ? Number(values.price.replace(',', '.')) : null;

    try {
      if (values.mode === 'new') {
        const trimmedSku = values.sku?.trim();
        await api.variants.createWithProduct({
          product: {
            name: values.productName.trim(),
            unit: values.unit,
            description: values.description?.trim() ? values.description.trim() : undefined,
            categoryId: values.categoryId === NO_CATEGORY ? null : values.categoryId,
          },
          variant: {
            ...(trimmedSku ? { sku: trimmedSku } : {}),
            attributes,
            price,
          },
        });
        toast.success('Товар и вариация созданы');
      } else {
        const trimmedSku = values.sku?.trim();
        await api.variants.create({
          productId: values.productId,
          ...(trimmedSku ? { sku: trimmedSku } : {}),
          attributes,
          price,
        });
        toast.success('Вариация создана');
      }
      onSaved();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Не удалось сохранить';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const productOptions = useMemo(
    () =>
      products
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
        .map((p) => ({
          id: p.id,
          label: `${p.name} (${p.variantCount ?? 0})`,
        })),
    [products],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Новая вариация</DialogTitle>
          <DialogDescription>
            Вариация — конкретный SKU товара (например «BOTTLE COLBY» в красном цвете).
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-md bg-muted p-1 text-sm">
          <button
            type="button"
            onClick={() => switchMode('new')}
            className={`flex-1 rounded px-3 py-1.5 transition-colors ${
              mode === 'new' ? 'bg-background shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Новый товар
          </button>
          <button
            type="button"
            onClick={() => switchMode('existing')}
            className={`flex-1 rounded px-3 py-1.5 transition-colors ${
              mode === 'existing' ? 'bg-background shadow-sm' : 'text-muted-foreground'
            }`}
          >
            К существующему
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {mode === 'new' ? (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Товар
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="productName">Название</Label>
                  <Input
                    id="productName"
                    autoFocus
                    placeholder="BOTTLE COLBY"
                    {...register('productName')}
                  />
                  {errors.mode === undefined && 'productName' in errors && errors.productName && (
                    <p className="text-sm text-destructive">{errors.productName.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit">Единица</Label>
                  <Select
                    value={unit}
                    onValueChange={(v) => setValue('unit', v as ProductUnit)}
                  >
                    <SelectTrigger id="unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(UNIT_LABEL) as ProductUnit[]).map((u) => (
                        <SelectItem key={u} value={u}>
                          {UNIT_LABEL[u]} ({u})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="categoryId">Категория</Label>
                <Select
                  value={categoryId}
                  onValueChange={(v) => setValue('categoryId', v)}
                >
                  <SelectTrigger id="categoryId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CATEGORY}>Без категории</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Описание</Label>
                <Textarea id="description" rows={2} {...register('description')} />
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Товар
              </p>
              <div className="space-y-2">
                <Label htmlFor="productId">Существующий товар</Label>
                <Select
                  value={productId}
                  onValueChange={(v) => setValue('productId', v)}
                >
                  <SelectTrigger id="productId">
                    <SelectValue placeholder="Выбери товар" />
                  </SelectTrigger>
                  <SelectContent>
                    {productOptions.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        Пока нет ни одного товара
                      </div>
                    )}
                    {productOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {'productId' in errors && errors.productId && (
                  <p className="text-sm text-destructive">{errors.productId.message}</p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-3 rounded-md border p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Вариация
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="sku">SKU</Label>
                <div className="flex gap-1">
                  <Input
                    id="sku"
                    className="font-mono"
                    placeholder="оставь пустым — сгенерируем"
                    {...register('sku', {
                      onChange: () => setSkuManuallyEdited(true),
                    })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleGenerateSku}
                    title="Сгенерировать из имени товара и цвета"
                    aria-label="Сгенерировать SKU"
                  >
                    <Wand2 className="h-4 w-4" />
                  </Button>
                </div>
                {errors.sku && <p className="text-sm text-destructive">{errors.sku.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="color">Цвет</Label>
                <Input id="color" placeholder="RED" {...register('color')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Цена</Label>
              <Input id="price" inputMode="decimal" placeholder="99.99" {...register('price')} />
              {errors.price && <p className="text-sm text-destructive">{errors.price.message}</p>}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Сохраняю…' : 'Создать'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
