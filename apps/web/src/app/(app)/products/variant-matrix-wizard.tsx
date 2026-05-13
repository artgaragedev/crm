'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import type {
  AttributeDto,
  AttributeValueDto,
  ProductUnit,
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
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: CategoryListItem[];
  onSaved: () => void;
}

/**
 * Wizard создания вариативного товара в 3 шага:
 *   1) Товар (name/unit/category/description)
 *   2) Атрибуты (выбор осей из справочника + значений; inline-добавление недостающего)
 *   3) Матрица — декартово произведение значений; bulk-применение цены/reorder; отключение отдельных строк.
 *
 * Отправляет POST /variants/with-matrix одной транзакцией.
 */
export function VariantMatrixWizard({ open, onOpenChange, categories, onSaved }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1 — product
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<ProductUnit>('PCS');
  const [categoryId, setCategoryId] = useState<string>(NO_CATEGORY);
  const [description, setDescription] = useState('');

  // Step 2 — attributes / values
  const [allAttributes, setAllAttributes] = useState<AttributeDto[] | null>(null);
  const [axes, setAxes] = useState<
    Array<{ attributeId: string; selectedValueIds: string[] }>
  >([]);
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

  // Reset state on open
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setName('');
    setUnit('PCS');
    setCategoryId(NO_CATEGORY);
    setDescription('');
    setAxes([]);
    setMatrix([]);
    setBulkPrice('');
    setBulkReorder('');
    void loadAttributes();
  }, [open, loadAttributes]);

  // ── helpers ─────────────────────────────────────────────────────────────

  const attributesById = useMemo(() => {
    const m = new Map<string, AttributeDto>();
    for (const a of allAttributes ?? []) m.set(a.id, a);
    return m;
  }, [allAttributes]);

  const cartesianProduct = useCallback(
    (
      sources: Array<{
        attributeId: string;
        valueIds: string[];
      }>,
    ): Array<{
      values: Array<{ attributeId: string; attributeValueId: string }>;
    }> => {
      if (sources.length === 0) return [];
      const result: Array<{
        values: Array<{ attributeId: string; attributeValueId: string }>;
      }> = [{ values: [] }];
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
        result.splice(0, result.length, ...next);
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
    return combos.map((c) => ({
      key: c.values.map((v) => v.attributeValueId).join('|'),
      values: c.values,
      sku: '',
      skuOverridden: false,
      price: '',
      reorderLevel: '',
      enabled: true,
    }));
  }, [axes, cartesianProduct]);

  const skuCandidateForRow = useCallback(
    (row: MatrixRow): string => {
      if (row.skuOverridden && row.sku) return row.sku;
      if (!name.trim()) return '';
      const cat = categories.find((c) => c.id === categoryId);
      const seq = cat?.nextProductSeq ?? 1;
      const parts = row.values
        .map((v) => {
          const attr = attributesById.get(v.attributeId);
          const valDto = attr?.values?.find((x) => x.id === v.attributeValueId);
          return valDto?.code ?? valDto?.value ?? '';
        });
      return buildSkuCandidate(name.trim(), parts, cat?.code ?? null, seq);
    },
    [name, categoryId, categories, attributesById],
  );

  // Когда переходим на шаг 3 — перегенерим матрицу, сохранив данные строк с тем же ключом.
  const buildMatrix = useCallback(() => {
    const fresh = matrixRowsFromAxes();
    const oldByKey = new Map(matrix.map((r) => [r.key, r]));
    setMatrix(
      fresh.map((r) => {
        const prev = oldByKey.get(r.key);
        return prev
          ? { ...r, sku: prev.sku, skuOverridden: prev.skuOverridden, price: prev.price, reorderLevel: prev.reorderLevel, enabled: prev.enabled }
          : r;
      }),
    );
  }, [matrix, matrixRowsFromAxes]);

  // ── step validation ────────────────────────────────────────────────────

  const canNextStep1 = name.trim().length > 0;
  const canNextStep2 =
    axes.length > 0 &&
    axes.every((a) => a.selectedValueIds.length > 0);
  const matrixSize = useMemo(() => {
    return axes.reduce((acc, a) => acc * Math.max(a.selectedValueIds.length, 0), 1);
  }, [axes]);

  // ── submit ─────────────────────────────────────────────────────────────

  const onSubmit = async () => {
    const enabled = matrix.filter((r) => r.enabled);
    if (enabled.length === 0) {
      toast.error('Включи хотя бы один вариант');
      return;
    }

    setSubmitting(true);
    try {
      const orderedAxes = axes.map((a, idx) => ({
        attributeId: a.attributeId,
        position: idx,
      }));
      const result = await api.variants.createWithMatrix({
        product: {
          name: name.trim(),
          unit,
          ...(description.trim() ? { description: description.trim() } : {}),
          categoryId: categoryId === NO_CATEGORY ? null : categoryId,
        },
        axes: orderedAxes,
        variants: enabled.map((r) => ({
          values: r.values,
          ...(r.skuOverridden && r.sku.trim() ? { sku: r.sku.trim() } : {}),
          price: r.price ? Number(r.price) : null,
          reorderLevel: r.reorderLevel ? Number(r.reorderLevel) : null,
        })),
      });
      toast.success(`Создан товар: ${result.variants.length} вариант(ов)`);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Не удалось создать товар';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Создать вариативный товар</DialogTitle>
          <DialogDescription>
            Шаг {step} из 3: {step === 1 ? 'товар' : step === 2 ? 'атрибуты' : 'матрица вариантов'}
          </DialogDescription>
        </DialogHeader>

        <StepIndicator step={step} />

        <div className="max-h-[60vh] overflow-y-auto pr-1">
          {step === 1 && (
            <Step1Product
              name={name}
              onNameChange={setName}
              unit={unit}
              onUnitChange={setUnit}
              categoryId={categoryId}
              onCategoryChange={setCategoryId}
              description={description}
              onDescriptionChange={setDescription}
              categories={categories}
            />
          )}

          {step === 2 && (
            <Step2Attributes
              allAttributes={allAttributes}
              axes={axes}
              onAxesChange={setAxes}
              onCreateAttribute={() => setAddingAttribute(true)}
              onCreateValueFor={(a) => setAddingValueFor(a)}
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
                setMatrix((prev) => prev.map((r) => ({ ...r, price: bulkPrice })));
              }}
              bulkReorder={bulkReorder}
              onBulkReorderChange={setBulkReorder}
              onApplyBulkReorder={() => {
                if (!bulkReorder) {
                  toast.error('Введи reorder для bulk-применения');
                  return;
                }
                setMatrix((prev) => prev.map((r) => ({ ...r, reorderLevel: bulkReorder })));
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
                Будет создано: <strong>{matrixSize}</strong> вариант(ов)
              </>
            )}
            {step === 3 && (
              <>
                Включено: <strong>{matrix.filter((r) => r.enabled).length}</strong> /{' '}
                {matrix.length}
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
              {submitting ? 'Создаю…' : 'Создать товар'}
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

function Step1Product({
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

function Step2Attributes({
  allAttributes,
  axes,
  onAxesChange,
  onCreateAttribute,
  onCreateValueFor,
}: {
  allAttributes: AttributeDto[] | null;
  axes: Array<{ attributeId: string; selectedValueIds: string[] }>;
  onAxesChange: (
    v: Array<{ attributeId: string; selectedValueIds: string[] }>,
  ) => void;
  onCreateAttribute: () => void;
  onCreateValueFor: (a: AttributeDto) => void;
}) {
  if (allAttributes === null) {
    return <div className="py-4 text-sm text-muted-foreground">Загружаю атрибуты…</div>;
  }

  const usedIds = new Set(axes.map((a) => a.attributeId));
  const available = allAttributes.filter((a) => !usedIds.has(a.id));

  const addAxis = (attrId: string) => {
    onAxesChange([...axes, { attributeId: attrId, selectedValueIds: [] }]);
  };
  const removeAxis = (idx: number) => {
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

      {axes.map((axis, idx) => {
        const attr = allAttributes.find((a) => a.id === axis.attributeId);
        if (!attr) return null;
        const values = attr.values ?? [];
        return (
          <Card key={axis.attributeId}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold">{attr.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{attr.code}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeAxis(idx)}
                  aria-label="Убрать ось"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {values.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  У атрибута нет значений. Добавь первое.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {values.map((v) => {
                    const selected = axis.selectedValueIds.includes(v.id);
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
              return (
                <tr
                  key={row.key}
                  className={cn('border-t', !row.enabled && 'opacity-50')}
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
                      disabled={!row.enabled}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      className="h-8 w-24"
                      value={row.price}
                      placeholder="0.00"
                      onChange={(e) => onRowChange(idx, { price: e.target.value })}
                      disabled={!row.enabled}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      className="h-8 w-20"
                      value={row.reorderLevel}
                      placeholder="—"
                      onChange={(e) => onRowChange(idx, { reorderLevel: e.target.value })}
                      disabled={!row.enabled}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) => onRowChange(idx, { enabled: e.target.checked })}
                      className="h-4 w-4 cursor-pointer"
                      title={row.enabled ? 'Будет создан' : 'Пропустить'}
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
