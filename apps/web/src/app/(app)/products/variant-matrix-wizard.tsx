'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, Plus, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import type {
  AttributeDto,
  Product,
  ProductUnit,
  Variant,
} from '@art-garage/shared';
import { api, ApiError, type CategoryListItem } from '@/lib/api';
import { buildSkuCandidate } from '@/lib/sku';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { ValueFormDialog } from '../attributes/value-form-dialog';
import { AttributeFormDialog } from '../attributes/attribute-form-dialog';

const NO_CATEGORY = '__none__';

const UNIT_OPTIONS: Array<{ value: ProductUnit; label: string }> = [
  { value: 'PCS', label: 'шт' },
  { value: 'KG', label: 'кг' },
  { value: 'L', label: 'л' },
  { value: 'M', label: 'м' },
  { value: 'PACK', label: 'упак' },
];

type Mode = 'new' | 'extend';

interface AxisState {
  attributeId: string;
  selectedValueIds: string[];
  /** В extend-режиме существующие оси товара нельзя убрать. */
  locked: boolean;
}

interface MatrixRow {
  /** Стабильный ключ строки — комбинация attributeValueId через "|". */
  key: string;
  values: Array<{ attributeId: string; attributeValueId: string }>;
  sku: string;
  /** '' = взять автогенерированный сервером */
  skuOverridden: boolean;
  price: string;
  reorderLevel: string;
  enabled: boolean;
  /** Эта комбинация уже есть у товара (только extend) — нельзя редактировать. */
  existing: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: CategoryListItem[];
  onSaved: () => void;
}

/** Каноническая форма комбинации — для сравнения «эта комбинация уже есть у товара». */
function canonicalKey(refs: ReadonlyArray<{ attributeId: string; attributeValueId: string }>): string {
  return refs
    .slice()
    .sort((a, b) => a.attributeId.localeCompare(b.attributeId))
    .map((r) => `${r.attributeId}=${r.attributeValueId}`)
    .join('|');
}

/**
 * Wizard работает в двух режимах:
 *   - new:    создаём новый вариативный товар + матрицу вариаций (POST /variants/with-matrix).
 *   - extend: добавляем к существующему вариативному товару недостающие оси/значения
 *             и новые комбинации (POST /variants/extend-matrix).
 *
 * 3 шага: 1) Товар (новый или выбор существующего), 2) Атрибуты, 3) Матрица.
 */
export function VariantMatrixWizard({ open, onOpenChange, categories, onSaved }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<Mode>('new');

  // Step 1 — new product
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<ProductUnit>('PCS');
  const [categoryId, setCategoryId] = useState<string>(NO_CATEGORY);
  const [description, setDescription] = useState('');

  // Step 1 — extend
  const [allProducts, setAllProducts] = useState<Product[] | null>(null);
  const [targetProductId, setTargetProductId] = useState<string | null>(null);
  const [targetVariants, setTargetVariants] = useState<Variant[] | null>(null);
  const [loadingTarget, setLoadingTarget] = useState(false);

  // Step 2 — attributes
  const [allAttributes, setAllAttributes] = useState<AttributeDto[] | null>(null);
  const [axes, setAxes] = useState<AxisState[]>([]);
  const [addingAttribute, setAddingAttribute] = useState(false);
  const [addingValueFor, setAddingValueFor] = useState<AttributeDto | null>(null);

  // Step 3 — matrix
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkReorder, setBulkReorder] = useState('');

  const loadAttributes = useCallback(async () => {
    try {
      const res = await api.attributes.list({ pageSize: 200 });
      setAllAttributes(res.items);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Не удалось загрузить атрибуты';
      toast.error(msg);
    }
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const res = await api.products.list({ pageSize: 500 });
      // В extend нужны только вариативные товары — у которых уже есть >=1 вариант.
      setAllProducts(res.items.filter((p) => (p.variantCount ?? 0) > 0));
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Не удалось загрузить товары';
      toast.error(msg);
    }
  }, []);

  // Reset on open.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setMode('new');
    setName('');
    setUnit('PCS');
    setCategoryId(NO_CATEGORY);
    setDescription('');
    setAllProducts(null);
    setTargetProductId(null);
    setTargetVariants(null);
    setLoadingTarget(false);
    setAxes([]);
    setMatrix([]);
    setBulkPrice('');
    setBulkReorder('');
    void loadAttributes();
  }, [open, loadAttributes]);

  // Подгружаем список товаров при первом переключении в extend.
  useEffect(() => {
    if (mode === 'extend' && allProducts === null) {
      void loadProducts();
    }
  }, [mode, allProducts, loadProducts]);

  // При смене режима сбрасываем зависящие от режима state, чтобы не было артефактов.
  useEffect(() => {
    if (mode === 'new') {
      setTargetProductId(null);
      setTargetVariants(null);
    }
    setAxes([]);
    setMatrix([]);
  }, [mode]);

  // При выборе товара в extend — тянем его варианты и инициализируем axes.
  useEffect(() => {
    if (mode !== 'extend' || !targetProductId) return;
    let cancelled = false;
    setLoadingTarget(true);
    (async () => {
      try {
        const variantsRes = await api.variants.list({ productId: targetProductId, pageSize: 500 });
        if (cancelled) return;
        const items = variantsRes.items;
        setTargetVariants(items);

        // Восстанавливаем axes из вариантов: для каждой attributeId собираем уникальные valueId,
        // запоминаем порядок появления (= порядок осей в SKU).
        const axesMap = new Map<string, { values: Set<string>; firstSeen: number }>();
        let order = 0;
        for (const v of items) {
          for (const ref of v.attributeValues ?? []) {
            const cur = axesMap.get(ref.attributeId);
            if (cur) {
              cur.values.add(ref.attributeValueId);
            } else {
              axesMap.set(ref.attributeId, {
                values: new Set([ref.attributeValueId]),
                firstSeen: order++,
              });
            }
          }
        }
        const initialAxes: AxisState[] = Array.from(axesMap.entries())
          .sort((a, b) => a[1].firstSeen - b[1].firstSeen)
          .map(([attributeId, meta]) => ({
            attributeId,
            selectedValueIds: Array.from(meta.values),
            locked: true,
          }));
        setAxes(initialAxes);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : 'Не удалось загрузить варианты';
        toast.error(msg);
      } finally {
        if (!cancelled) setLoadingTarget(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, targetProductId]);

  // ── derived ────────────────────────────────────────────────────────────

  const attributesById = useMemo(() => {
    const m = new Map<string, AttributeDto>();
    for (const a of allAttributes ?? []) m.set(a.id, a);
    return m;
  }, [allAttributes]);

  const targetProduct = useMemo(
    () =>
      targetProductId && allProducts ? allProducts.find((p) => p.id === targetProductId) ?? null : null,
    [targetProductId, allProducts],
  );

  /** Канонические ключи существующих комбинаций — для блокировки строк в матрице. */
  const existingCombinationKeys = useMemo(() => {
    if (mode !== 'extend' || !targetVariants) return new Set<string>();
    const out = new Set<string>();
    for (const v of targetVariants) {
      const refs = (v.attributeValues ?? []).map((r) => ({
        attributeId: r.attributeId,
        attributeValueId: r.attributeValueId,
      }));
      out.add(canonicalKey(refs));
    }
    return out;
  }, [mode, targetVariants]);

  /** existingValueIds per axis — для подсветки «уже у товара» в Step 2. */
  const existingValueIdsByAxis = useMemo(() => {
    const out = new Map<string, Set<string>>();
    if (mode !== 'extend' || !targetVariants) return out;
    for (const v of targetVariants) {
      for (const ref of v.attributeValues ?? []) {
        let set = out.get(ref.attributeId);
        if (!set) {
          set = new Set();
          out.set(ref.attributeId, set);
        }
        set.add(ref.attributeValueId);
      }
    }
    return out;
  }, [mode, targetVariants]);

  const productOptions: ComboboxOption[] = useMemo(
    () =>
      (allProducts ?? [])
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
        .map((p) => ({
          value: p.id,
          label: p.name,
          description: p.code ? `Артикул ${p.code}` : undefined,
          searchValue: `${p.name} ${p.code ?? ''}`,
          hint: (
            <span className="tabular-nums">
              {p.variantCount ?? 0} вар.
            </span>
          ),
        })),
    [allProducts],
  );

  const cartesianProduct = useCallback(
    (
      sources: Array<{ attributeId: string; valueIds: string[] }>,
    ): Array<{ values: Array<{ attributeId: string; attributeValueId: string }> }> => {
      if (sources.length === 0) return [];
      let result: Array<{ values: Array<{ attributeId: string; attributeValueId: string }> }> = [
        { values: [] },
      ];
      for (const src of sources) {
        const next: typeof result = [];
        for (const acc of result) {
          for (const vId of src.valueIds) {
            next.push({
              values: [...acc.values, { attributeId: src.attributeId, attributeValueId: vId }],
            });
          }
        }
        if (next.length === 0) return [];
        result = next;
      }
      return result;
    },
    [],
  );

  const matrixRowsFromAxes = useCallback((): MatrixRow[] => {
    const sources = axes
      .filter((a) => a.selectedValueIds.length > 0)
      .map((a) => ({ attributeId: a.attributeId, valueIds: a.selectedValueIds }));
    const combos = cartesianProduct(sources);
    return combos.map((c) => {
      const existing = existingCombinationKeys.has(canonicalKey(c.values));
      return {
        key: c.values.map((v) => v.attributeValueId).join('|'),
        values: c.values,
        sku: '',
        skuOverridden: false,
        price: '',
        reorderLevel: '',
        enabled: !existing,
        existing,
      };
    });
  }, [axes, cartesianProduct, existingCombinationKeys]);

  const skuCandidateForRow = useCallback(
    (row: MatrixRow): string => {
      if (row.skuOverridden && row.sku) return row.sku;
      const parts = row.values.map((v) => {
        const attr = attributesById.get(v.attributeId);
        const valDto = attr?.values?.find((x) => x.id === v.attributeValueId);
        return valDto?.code ?? valDto?.value ?? '';
      });
      if (mode === 'extend' && targetProduct?.code) {
        return [targetProduct.code, ...parts].filter(Boolean).join('-');
      }
      if (!name.trim()) return '';
      const cat = categories.find((c) => c.id === categoryId);
      const seq = cat?.nextProductSeq ?? 1;
      return buildSkuCandidate(name.trim(), parts, cat?.code ?? null, seq);
    },
    [mode, name, categoryId, categories, attributesById, targetProduct],
  );

  // Перегенерим матрицу, сохранив сохранённое юзером (sku/price/reorder/enabled).
  const buildMatrix = useCallback(() => {
    const fresh = matrixRowsFromAxes();
    const oldByKey = new Map(matrix.map((r) => [r.key, r]));
    setMatrix(
      fresh.map((r) => {
        const prev = oldByKey.get(r.key);
        if (!prev) return r;
        return {
          ...r,
          sku: prev.sku,
          skuOverridden: prev.skuOverridden,
          price: prev.price,
          reorderLevel: prev.reorderLevel,
          // Existing — всегда disabled-checkbox; иначе сохраняем выбор юзера.
          enabled: r.existing ? false : prev.enabled,
        };
      }),
    );
  }, [matrix, matrixRowsFromAxes]);

  // ── step validation ────────────────────────────────────────────────────

  const canNextStep1 =
    mode === 'new'
      ? name.trim().length > 0
      : !!targetProductId && targetVariants !== null && !loadingTarget;
  const canNextStep2 = axes.length > 0 && axes.every((a) => a.selectedValueIds.length > 0);
  const matrixSize = useMemo(
    () => axes.reduce((acc, a) => acc * Math.max(a.selectedValueIds.length, 0), 1),
    [axes],
  );
  const newRowsCount = matrix.filter((r) => !r.existing).length;
  const enabledCount = matrix.filter((r) => r.enabled).length;

  // ── submit ─────────────────────────────────────────────────────────────

  const onSubmit = async () => {
    const enabled = matrix.filter((r) => r.enabled && !r.existing);
    if (enabled.length === 0) {
      toast.error('Включи хотя бы один новый вариант');
      return;
    }
    setSubmitting(true);
    try {
      const orderedAxes = axes.map((a, idx) => ({ attributeId: a.attributeId, position: idx }));
      const sharedVariantPayload = enabled.map((r) => ({
        values: r.values,
        ...(r.skuOverridden && r.sku.trim() ? { sku: r.sku.trim() } : {}),
        price: r.price ? Number(r.price) : null,
        reorderLevel: r.reorderLevel ? Number(r.reorderLevel) : null,
      }));

      if (mode === 'new') {
        const result = await api.variants.createWithMatrix({
          product: {
            name: name.trim(),
            unit,
            ...(description.trim() ? { description: description.trim() } : {}),
            categoryId: categoryId === NO_CATEGORY ? null : categoryId,
          },
          axes: orderedAxes,
          variants: sharedVariantPayload,
        });
        toast.success(`Создан товар: ${result.variants.length} вариант(ов)`);
      } else {
        if (!targetProductId) throw new Error('Не выбран товар для расширения');
        const result = await api.variants.extendWithMatrix({
          productId: targetProductId,
          axes: orderedAxes,
          variants: sharedVariantPayload,
        });
        toast.success(`Добавлено вариаций: ${result.variants.length}`);
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Не удалось сохранить';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────

  const title = mode === 'new' ? 'Создать вариативный товар' : 'Расширить вариативный товар';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Шаг {step} из 3: {step === 1 ? 'товар' : step === 2 ? 'атрибуты' : 'матрица вариантов'}
          </DialogDescription>
        </DialogHeader>

        <StepIndicator step={step} />

        <div className="max-h-[60vh] overflow-y-auto pr-1">
          {step === 1 && (
            <Step1
              mode={mode}
              onModeChange={setMode}
              // new
              name={name}
              onNameChange={setName}
              unit={unit}
              onUnitChange={setUnit}
              categoryId={categoryId}
              onCategoryChange={setCategoryId}
              description={description}
              onDescriptionChange={setDescription}
              categories={categories}
              // extend
              productOptions={productOptions}
              productsLoading={mode === 'extend' && allProducts === null}
              targetProductId={targetProductId}
              onTargetProductChange={setTargetProductId}
              targetProduct={targetProduct}
              loadingTarget={loadingTarget}
              existingVariantsCount={targetVariants?.length ?? 0}
            />
          )}

          {step === 2 && (
            <Step2Attributes
              mode={mode}
              allAttributes={allAttributes}
              axes={axes}
              onAxesChange={setAxes}
              onCreateAttribute={() => setAddingAttribute(true)}
              onCreateValueFor={(a) => setAddingValueFor(a)}
              existingValueIdsByAxis={existingValueIdsByAxis}
            />
          )}

          {step === 3 && (
            <Step3Matrix
              matrix={matrix}
              attributesById={attributesById}
              axesOrder={axes.map((a) => a.attributeId)}
              skuCandidate={skuCandidateForRow}
              onRowChange={(idx, patch) =>
                setMatrix((prev) =>
                  prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
                )
              }
              bulkPrice={bulkPrice}
              onBulkPriceChange={setBulkPrice}
              onApplyBulkPrice={() => {
                if (!bulkPrice) {
                  toast.error('Введи цену для bulk-применения');
                  return;
                }
                setMatrix((prev) =>
                  prev.map((r) => (r.existing ? r : { ...r, price: bulkPrice })),
                );
              }}
              bulkReorder={bulkReorder}
              onBulkReorderChange={setBulkReorder}
              onApplyBulkReorder={() => {
                if (!bulkReorder) {
                  toast.error('Введи reorder для bulk-применения');
                  return;
                }
                setMatrix((prev) =>
                  prev.map((r) => (r.existing ? r : { ...r, reorderLevel: bulkReorder })),
                );
              }}
            />
          )}
        </div>

        <div className="flex items-center justify-between border-t pt-4">
          <Button
            variant="outline"
            disabled={step === 1 || submitting}
            onClick={() => setStep((s) => (s === 1 ? 1 : ((s - 1) as 1 | 2 | 3)))}
          >
            <ChevronLeft className="mr-1 h-4 w-4" /> Назад
          </Button>
          <div className="text-xs text-muted-foreground">
            {step === 2 && (
              <>
                {mode === 'extend' ? (
                  <>
                    Будет создано новых: <strong>{Math.max(matrixSize - existingCombinationKeys.size, 0)}</strong>
                    <span className="ml-1 text-muted-foreground/70">
                      (уже есть: {existingCombinationKeys.size})
                    </span>
                  </>
                ) : (
                  <>
                    Будет создано: <strong>{matrixSize}</strong> вариант(ов)
                  </>
                )}
              </>
            )}
            {step === 3 && (
              <>
                Включено: <strong>{enabledCount}</strong> / {newRowsCount}
                {mode === 'extend' && (
                  <span className="ml-1 text-muted-foreground/70">
                    (+ {existingCombinationKeys.size} уже есть)
                  </span>
                )}
              </>
            )}
          </div>
          {step < 3 ? (
            <Button
              disabled={(step === 1 && !canNextStep1) || (step === 2 && !canNextStep2)}
              onClick={() => {
                if (step === 2) buildMatrix();
                setStep((s) => (s === 3 ? 3 : ((s + 1) as 1 | 2 | 3)));
              }}
            >
              Далее <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={onSubmit} disabled={submitting}>
              {submitting ? 'Сохраняю…' : mode === 'new' ? 'Создать товар' : 'Добавить вариации'}
            </Button>
          )}
        </div>
      </DialogContent>

      <AttributeFormDialog
        open={addingAttribute}
        onOpenChange={setAddingAttribute}
        onSaved={() => {
          setAddingAttribute(false);
          void loadAttributes();
        }}
      />
      {addingValueFor && (
        <ValueFormDialog
          open={!!addingValueFor}
          onOpenChange={(v) => !v && setAddingValueFor(null)}
          attribute={addingValueFor}
          onSaved={() => {
            setAddingValueFor(null);
            void loadAttributes();
          }}
        />
      )}
    </Dialog>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const labels = ['Товар', 'Атрибуты', 'Матрица'];
  return (
    <div className="flex items-center gap-2 pb-2">
      {labels.map((label, idx) => {
        const num = (idx + 1) as 1 | 2 | 3;
        const active = num === step;
        const done = num < step;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
                done && 'bg-primary text-primary-foreground',
                active && 'bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-1',
                !done && !active && 'bg-muted text-muted-foreground',
              )}
            >
              {num}
            </div>
            <span
              className={cn(
                'text-xs',
                active ? 'font-medium' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
            {num < 3 && <div className="ml-2 h-px w-8 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

function Step1(props: {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  // new
  name: string;
  onNameChange: (v: string) => void;
  unit: ProductUnit;
  onUnitChange: (v: ProductUnit) => void;
  categoryId: string;
  onCategoryChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  categories: CategoryListItem[];
  // extend
  productOptions: ComboboxOption[];
  productsLoading: boolean;
  targetProductId: string | null;
  onTargetProductChange: (id: string | null) => void;
  targetProduct: Product | null;
  loadingTarget: boolean;
  existingVariantsCount: number;
}) {
  return (
    <div className="space-y-4">
      <ModeToggle mode={props.mode} onChange={props.onModeChange} />

      {props.mode === 'new' ? (
        <Step1NewFields
          name={props.name}
          onNameChange={props.onNameChange}
          unit={props.unit}
          onUnitChange={props.onUnitChange}
          categoryId={props.categoryId}
          onCategoryChange={props.onCategoryChange}
          description={props.description}
          onDescriptionChange={props.onDescriptionChange}
          categories={props.categories}
        />
      ) : (
        <Step1ExtendPicker
          options={props.productOptions}
          loading={props.productsLoading}
          targetProductId={props.targetProductId}
          onChange={props.onTargetProductChange}
          targetProduct={props.targetProduct}
          loadingTarget={props.loadingTarget}
          existingVariantsCount={props.existingVariantsCount}
        />
      )}
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="inline-flex rounded-md border bg-muted/40 p-0.5 text-sm">
      <button
        type="button"
        onClick={() => onChange('new')}
        className={cn(
          'rounded px-3 py-1.5 transition-colors',
          mode === 'new' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        Новый товар
      </button>
      <button
        type="button"
        onClick={() => onChange('extend')}
        className={cn(
          'rounded px-3 py-1.5 transition-colors',
          mode === 'extend' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        Расширить существующий
      </button>
    </div>
  );
}

function Step1NewFields({
  name,
  onNameChange,
  unit,
  onUnitChange,
  categoryId,
  onCategoryChange,
  description,
  onDescriptionChange,
  categories,
}: {
  name: string;
  onNameChange: (v: string) => void;
  unit: ProductUnit;
  onUnitChange: (v: ProductUnit) => void;
  categoryId: string;
  onCategoryChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  categories: CategoryListItem[];
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="wizard-name">Название</Label>
        <Input
          id="wizard-name"
          autoFocus
          placeholder="BOTTLE COLBY"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="wizard-unit">Единица измерения</Label>
          <Select value={unit} onValueChange={(v) => onUnitChange(v as ProductUnit)}>
            <SelectTrigger id="wizard-unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNIT_OPTIONS.map((u) => (
                <SelectItem key={u.value} value={u.value}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="wizard-category">Категория</Label>
          <Select value={categoryId} onValueChange={onCategoryChange}>
            <SelectTrigger id="wizard-category">
              <SelectValue placeholder="Без категории" />
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
      </div>
      <div className="space-y-2">
        <Label htmlFor="wizard-description">Описание</Label>
        <Textarea
          id="wizard-description"
          placeholder="Опционально"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          rows={2}
        />
      </div>
    </div>
  );
}

function Step1ExtendPicker({
  options,
  loading,
  targetProductId,
  onChange,
  targetProduct,
  loadingTarget,
  existingVariantsCount,
}: {
  options: ComboboxOption[];
  loading: boolean;
  targetProductId: string | null;
  onChange: (id: string | null) => void;
  targetProduct: Product | null;
  loadingTarget: boolean;
  existingVariantsCount: number;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Товар</Label>
        {loading ? (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            Загружаю список товаров…
          </div>
        ) : (
          <Combobox
            options={options}
            value={targetProductId}
            onChange={onChange}
            placeholder="Найти вариативный товар"
            searchPlaceholder="Введи название или артикул"
            emptyText="Ничего не найдено"
          />
        )}
      </div>
      {targetProduct && (
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <div className="font-medium">{targetProduct.name}</div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {targetProduct.code && (
              <span>
                Артикул: <span className="font-mono">{targetProduct.code}</span>
              </span>
            )}
            {targetProduct.category?.name && <span>Категория: {targetProduct.category.name}</span>}
            <span>
              Текущие вариации: <strong>{loadingTarget ? '…' : existingVariantsCount}</strong>
            </span>
          </div>
          {loadingTarget && (
            <div className="mt-2 text-xs text-muted-foreground">Подгружаю существующие оси…</div>
          )}
        </div>
      )}
    </div>
  );
}

function Step2Attributes({
  mode,
  allAttributes,
  axes,
  onAxesChange,
  onCreateAttribute,
  onCreateValueFor,
  existingValueIdsByAxis,
}: {
  mode: Mode;
  allAttributes: AttributeDto[] | null;
  axes: AxisState[];
  onAxesChange: (v: AxisState[]) => void;
  onCreateAttribute: () => void;
  onCreateValueFor: (a: AttributeDto) => void;
  existingValueIdsByAxis: Map<string, Set<string>>;
}) {
  if (allAttributes === null) {
    return <div className="py-4 text-sm text-muted-foreground">Загружаю атрибуты…</div>;
  }

  const usedIds = new Set(axes.map((a) => a.attributeId));
  const available = allAttributes.filter((a) => !usedIds.has(a.id));

  const addAxis = (attrId: string) => {
    onAxesChange([...axes, { attributeId: attrId, selectedValueIds: [], locked: false }]);
  };
  const removeAxis = (idx: number) => {
    if (axes[idx]?.locked) return;
    onAxesChange(axes.filter((_, i) => i !== idx));
  };
  const toggleValue = (axisIdx: number, valueId: string) => {
    onAxesChange(
      axes.map((a, i) => {
        if (i !== axisIdx) return a;
        const has = a.selectedValueIds.includes(valueId);
        return {
          ...a,
          selectedValueIds: has
            ? a.selectedValueIds.filter((v) => v !== valueId)
            : [...a.selectedValueIds, valueId],
        };
      }),
    );
  };

  return (
    <div className="space-y-4">
      {axes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Выбери одну или несколько осей: например «Цвет» и «Размер».
        </p>
      )}

      {mode === 'extend' && axes.some((a) => a.locked) && (
        <p className="text-xs text-muted-foreground">
          Оси, отмеченные значком <Lock className="inline h-3 w-3 align-text-bottom" />,
          уже есть у товара и не могут быть убраны. Существующие значения отмечены — можно добавить
          к ним новые галочками ниже.
        </p>
      )}

      {axes.map((axis, idx) => {
        const attr = allAttributes.find((a) => a.id === axis.attributeId);
        if (!attr) return null;
        const values = attr.values ?? [];
        const existingValues = existingValueIdsByAxis.get(axis.attributeId) ?? new Set<string>();
        return (
          <Card key={axis.attributeId}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-2">
                  {axis.locked && (
                    <Lock className="h-3.5 w-3.5 self-center text-muted-foreground" aria-label="Существующая ось" />
                  )}
                  <span className="font-semibold">{attr.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{attr.code}</span>
                </div>
                {!axis.locked && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeAxis(idx)}
                    aria-label="Убрать ось"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {values.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  У атрибута нет значений. Добавь первое.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {values.map((v) => {
                    const selected = axis.selectedValueIds.includes(v.id);
                    const isExisting = existingValues.has(v.id);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => toggleValue(idx, v.id)}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-md border px-2 py-1 text-sm transition-colors',
                          selected
                            ? 'border-primary bg-primary/10'
                            : 'bg-background hover:bg-muted',
                        )}
                      >
                        {attr.type === 'SWATCH' && (
                          <span
                            className="h-4 w-4 rounded-full border"
                            style={{ background: v.swatch ?? 'transparent' }}
                          />
                        )}
                        <span>{v.label ?? v.value}</span>
                        {isExisting && (
                          <span className="rounded-sm bg-muted px-1 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                            уже есть
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCreateValueFor(attr)}
              >
                <Plus className="mr-1 h-3 w-3" /> Новое значение
              </Button>
            </CardContent>
          </Card>
        );
      })}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        {available.length > 0 && (
          <Select
            value=""
            onValueChange={(v) => {
              if (v) addAxis(v);
            }}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Добавить ось…" />
            </SelectTrigger>
            <SelectContent>
              {available.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="ghost" size="sm" onClick={onCreateAttribute}>
          <Plus className="mr-1 h-3 w-3" /> Новый атрибут
        </Button>
      </div>
    </div>
  );
}

function Step3Matrix({
  matrix,
  attributesById,
  axesOrder,
  skuCandidate,
  onRowChange,
  bulkPrice,
  onBulkPriceChange,
  onApplyBulkPrice,
  bulkReorder,
  onBulkReorderChange,
  onApplyBulkReorder,
}: {
  matrix: MatrixRow[];
  attributesById: Map<string, AttributeDto>;
  axesOrder: string[];
  skuCandidate: (row: MatrixRow) => string;
  onRowChange: (idx: number, patch: Partial<MatrixRow>) => void;
  bulkPrice: string;
  onBulkPriceChange: (v: string) => void;
  onApplyBulkPrice: () => void;
  bulkReorder: string;
  onBulkReorderChange: (v: string) => void;
  onApplyBulkReorder: () => void;
}) {
  if (matrix.length === 0) {
    return <div className="py-4 text-sm text-muted-foreground">Нет вариантов для отображения.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Цена ко всем</Label>
            <Input
              type="number"
              className="h-9 w-28"
              value={bulkPrice}
              onChange={(e) => onBulkPriceChange(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <Button variant="outline" size="sm" onClick={onApplyBulkPrice}>
            <Wand2 className="mr-1 h-3 w-3" /> Применить
          </Button>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Reorder ко всем</Label>
            <Input
              type="number"
              className="h-9 w-28"
              value={bulkReorder}
              onChange={(e) => onBulkReorderChange(e.target.value)}
              placeholder="5"
            />
          </div>
          <Button variant="outline" size="sm" onClick={onApplyBulkReorder}>
            <Wand2 className="mr-1 h-3 w-3" /> Применить
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              {axesOrder.map((attrId) => {
                const attr = attributesById.get(attrId);
                return (
                  <th key={attrId} className="px-3 py-2 text-left font-medium">
                    {attr?.name ?? attrId}
                  </th>
                );
              })}
              <th className="px-3 py-2 text-left font-medium">SKU</th>
              <th className="px-3 py-2 text-left font-medium">Цена</th>
              <th className="px-3 py-2 text-left font-medium">Reorder</th>
              <th className="w-12 px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((row, idx) => {
              const placeholder = skuCandidate(row);
              const disabled = row.existing || !row.enabled;
              return (
                <tr
                  key={row.key}
                  className={cn(
                    'border-t',
                    !row.enabled && 'opacity-50',
                    row.existing && 'bg-muted/30',
                  )}
                >
                  {axesOrder.map((attrId) => {
                    const ref = row.values.find((v) => v.attributeId === attrId);
                    const attr = attributesById.get(attrId);
                    const val = ref
                      ? attr?.values?.find((x) => x.id === ref.attributeValueId)
                      : undefined;
                    return (
                      <td key={attrId} className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {attr?.type === 'SWATCH' && val?.swatch && (
                            <span
                              className="h-3 w-3 rounded-full border"
                              style={{ background: val.swatch }}
                            />
                          )}
                          <span>{val?.label ?? val?.value ?? '—'}</span>
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2">
                    {row.existing ? (
                      <span className="text-xs text-muted-foreground">уже есть</span>
                    ) : (
                      <Input
                        className="h-8 font-mono text-xs"
                        value={row.skuOverridden ? row.sku : ''}
                        placeholder={placeholder || 'авто'}
                        onChange={(e) =>
                          onRowChange(idx, {
                            sku: e.target.value,
                            skuOverridden: e.target.value.length > 0,
                          })
                        }
                        disabled={disabled}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.existing ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <Input
                        type="number"
                        className="h-8 w-24"
                        value={row.price}
                        placeholder="0.00"
                        onChange={(e) => onRowChange(idx, { price: e.target.value })}
                        disabled={disabled}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {row.existing ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <Input
                        type="number"
                        className="h-8 w-20"
                        value={row.reorderLevel}
                        placeholder="—"
                        onChange={(e) => onRowChange(idx, { reorderLevel: e.target.value })}
                        disabled={disabled}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) => onRowChange(idx, { enabled: e.target.checked })}
                      disabled={row.existing}
                      className="h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
                      title={
                        row.existing
                          ? 'Уже существует у товара'
                          : row.enabled
                            ? 'Будет создан'
                            : 'Пропустить'
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
