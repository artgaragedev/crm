'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Plus, Settings2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Customer, MovementType, Supplier, Variant } from '@art-garage/shared';
import { api, ApiError, type VariantLot } from '@/lib/api';
import { cn, formatDateTime, formatPrice, moldovaLocalToIso, nowMoldovaLocal } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

const UNIT_LABEL: Record<string, string> = {
  PCS: 'шт',
  KG: 'кг',
  L: 'л',
  M: 'м',
  PACK: 'упак',
};

const TYPE_META: Record<
  MovementType,
  {
    title: string;
    subtitle: string;
    icon: React.ElementType;
    iconClassName: string;
    submitLabel: string;
    counterparty: 'supplier' | 'customer' | 'none';
    allowNegative: boolean;
  }
> = {
  IN: {
    title: 'Приход',
    subtitle: 'Поступление товара от поставщика. Добавь все позиции одной накладной.',
    icon: ArrowDownToLine,
    iconClassName: 'bg-emerald-100 text-emerald-700',
    submitLabel: 'Оприходовать',
    counterparty: 'supplier',
    allowNegative: false,
  },
  OUT: {
    title: 'Списание / Отгрузка',
    subtitle: 'Выдача товара клиенту. Все позиции — одной отгрузкой.',
    icon: ArrowUpFromLine,
    iconClassName: 'bg-rose-100 text-rose-700',
    submitLabel: 'Списать',
    counterparty: 'customer',
    allowNegative: false,
  },
  ADJUST: {
    title: 'Корректировка остатка',
    subtitle:
      'Ручная корректировка без контрагента. Положительное — нашли, отрицательное — потеря/брак.',
    icon: Settings2,
    iconClassName: 'bg-amber-100 text-amber-700',
    submitLabel: 'Применить',
    counterparty: 'none',
    allowNegative: true,
  },
};

interface Line {
  /** локальный id строки для React-key */
  key: string;
  variantId: string | null;
  /** строковое представление количества (для signed ADJUST) */
  qty: string;
  /** Закупочная цена для IN/ADJUST+ (опционально, дефолт 0). */
  unitCost: string;
  /** Фактическая цена продажи за единицу (для OUT/ADJUST-). По умолчанию авто-расчёт из Variant.price × (1 − customer.discountPercent). */
  unitPrice: string;
  /** Менеджер вручную переписал цену — больше не пересчитываем автоматически. */
  priceTouched: boolean;
  /** Ручное распределение по партиям (для OUT/ADJUST-). null = FIFO. */
  manualAllocations: Array<{ lotId: string; qty: string }> | null;
}

const newLine = (): Line => ({
  key: newLineKey(),
  variantId: null,
  qty: '',
  unitCost: '',
  unitPrice: '',
  priceTouched: false,
  manualAllocations: null,
});

interface Props {
  type: MovementType | null;
  onClose: () => void;
  variants: Variant[];
  suppliers: Supplier[];
  customers: Customer[];
  onSaved: () => void;
}

let lineIdCounter = 0;
const newLineKey = () => `ln-${++lineIdCounter}`;

export function MovementSheet({ type, onClose, variants, suppliers, customers, onSaved }: Props) {
  const open = type !== null;
  const meta = TYPE_META[type ?? 'IN'];
  const Icon = meta.icon;

  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [counterpartyId, setCounterpartyId] = useState<string | null>(null);
  const [date, setDate] = useState<string>(() => nowMoldovaLocal());
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  /** Кеш активных lot'ов per variantId — загружается по требованию когда юзер раскрывает manual. */
  const [lotsByVariant, setLotsByVariant] = useState<Record<string, VariantLot[]>>({});

  // Server-side search: при вводе в Combobox строки делаем debounced запрос к /variants?search=...,
  // потому что список потенциально длиннее, чем initial-загруженные 500 (TURMAN на букву T мог не попасть).
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Variant[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Persistent кеш variant'ов: НЕ пересчитывается с нуля при смене searchResults.
  // Без него ранее выбранные в lines варианты "пропадали" из variantOptions, когда юзер ищет
  // что-то ещё в другой строке — searchQuery shared, и variantOptions становится
  // `searchResults only`, теряя ранее выбранные. Trigger Combobox-а той строки рендерил placeholder.
  const [variantCache, setVariantCache] = useState<Map<string, Variant>>(() => new Map());

  useEffect(() => {
    setVariantCache((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const v of variants) {
        if (next.get(v.id) !== v) {
          next.set(v.id, v);
          changed = true;
        }
      }
      if (searchResults) {
        for (const v of searchResults) {
          if (next.get(v.id) !== v) {
            next.set(v.id, v);
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [variants, searchResults]);

  const fetchLots = async (variantId: string) => {
    if (lotsByVariant[variantId]) return lotsByVariant[variantId];
    try {
      const lots = await api.variants.lots(variantId);
      const active = lots.filter((l) => l.remainingQuantity > 0.0001);
      setLotsByVariant((prev) => ({ ...prev, [variantId]: active }));
      return active;
    } catch {
      return [];
    }
  };

  // Сброс при открытии
  useEffect(() => {
    if (open) {
      setLines([newLine()]);
      setCounterpartyId(null);
      setDate(nowMoldovaLocal());
      setNote('');
    }
  }, [open, type]);

  // Debounce поиска в backend: при изменении searchQuery — 300ms тишины — запрос.
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length === 0) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await api.variants.list({ search: q, pageSize: 50 });
        setSearchResults(res.items);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  // Единый кеш variant'ов по id — для info-блока (остаток/цена) под Combobox'ом.
  // Использует persistent variantCache чтобы выбранный variant не "пропадал" из info-блока,
  // когда searchResults меняется (юзер ищет в другой строке).
  const variantById = variantCache;

  const variantOptions: ComboboxOption[] = useMemo(() => {
    // Если юзер что-то ввёл — показываем результаты сервера; иначе — initial-загруженный список.
    const source = searchQuery.trim().length > 0 ? (searchResults ?? []) : variants;

    // КРИТИЧНО: добавляем сюда варианты которые УЖЕ выбраны в lines, но отсутствуют в source.
    // Иначе trigger Combobox-а той строки рендерит placeholder (options.find(value) → undefined),
    // и юзеру кажется что клик "не сработал" — хотя state был обновлён правильно.
    const result: Variant[] = [];
    const seen = new Set<string>();
    for (const v of source) {
      if (!seen.has(v.id)) {
        result.push(v);
        seen.add(v.id);
      }
    }
    for (const l of lines) {
      if (l.variantId && !seen.has(l.variantId)) {
        const v = variantCache.get(l.variantId);
        if (v) {
          result.push(v);
          seen.add(v.id);
        }
      }
    }

    return result
      .sort((a, b) => {
        const an = a.product?.name ?? '';
        const bn = b.product?.name ?? '';
        return an.localeCompare(bn, 'ru') || a.sku.localeCompare(b.sku);
      })
      .map((v) => {
        const productName = v.product?.name ?? '—';
        const color = v.attributes.color ? ` · ${v.attributes.color}` : '';
        const size = v.attributes.size ? ` · ${v.attributes.size}` : '';
        const unit = v.product ? UNIT_LABEL[v.product.unit] ?? '' : '';
        return {
          value: v.id,
          label: `${productName}${color}${size}`,
          description: `SKU ${v.sku}`,
          searchValue: `${productName} ${v.sku} ${v.attributes.color ?? ''} ${v.attributes.size ?? ''}`,
          hint: (
            <span className="tabular-nums">
              ост. {v.currentStock} {unit}
            </span>
          ),
        };
      });
  }, [variants, searchResults, searchQuery, lines, variantCache]);

  const counterpartyOptions: ComboboxOption[] = useMemo(() => {
    if (meta.counterparty === 'supplier') {
      return suppliers.map((s) => ({ value: s.id, label: s.name, searchValue: s.name }));
    }
    if (meta.counterparty === 'customer') {
      return customers.map((c) => ({
        value: c.id,
        label: c.name,
        searchValue: c.name,
        hint:
          c.discountPercent > 0 ? (
            <span className="text-emerald-700">−{c.discountPercent}%</span>
          ) : undefined,
      }));
    }
    return [];
  }, [meta.counterparty, suppliers, customers]);

  /** Скидка выбранного клиента (только для OUT). */
  const customerDiscount = useMemo(() => {
    if (type !== 'OUT' || !counterpartyId) return 0;
    const c = customers.find((x) => x.id === counterpartyId);
    return c?.discountPercent ?? 0;
  }, [type, counterpartyId, customers]);

  /** Считает фактическую цену продажи: base × (1 − discount/100), округление до 2 знаков. */
  const computeSalePrice = (variantId: string | null): string => {
    if (!variantId || type !== 'OUT') return '';
    const v = variantById.get(variantId);
    if (!v || v.price === null || v.price === undefined) return '';
    const final = v.price * (1 - customerDiscount / 100);
    return (Math.round(final * 100) / 100).toString();
  };

  /** Когда меняется клиент (и его скидка) — пересчитать цены у строк, где менеджер не правил вручную. */
  useEffect(() => {
    if (type !== 'OUT') return;
    setLines((prev) =>
      prev.map((l) => {
        if (l.priceTouched) return l;
        if (!l.variantId) return l;
        const v = variantById.get(l.variantId);
        if (!v || v.price === null || v.price === undefined) return l;
        const final = v.price * (1 - customerDiscount / 100);
        return { ...l, unitPrice: (Math.round(final * 100) / 100).toString() };
      }),
    );
    // namespaced на customerDiscount + type: пересчитываем только при смене скидки.
    // variantById тут не нужен — изменение variant на конкретной строке обрабатывается в onChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerDiscount, type]);

  const addLine = () =>
    setLines((prev) => [
      ...prev,
      newLine(),
    ]);
  const removeLine = (key: string) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  const updateLine = (key: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  // Сводка. Для IN/ADJUST+ считаем сумму закупки (qty × unitCost),
  // для OUT/ADJUST- — фактическую выручку (qty × unitPrice — то, что замораживается на движении).
  const summary = useMemo(() => {
    let count = 0;
    let totalQty = 0;
    let totalValue = 0;
    let totalCost = 0;
    let totalRevenue = 0;
    const isInbound = type === 'IN' || type === 'ADJUST';
    for (const l of lines) {
      const v = l.variantId ? variantById.get(l.variantId) : null;
      const q = l.qty ? Number(l.qty.replace(',', '.')) : 0;
      if (v && Number.isFinite(q) && q !== 0) {
        count++;
        totalQty += Math.abs(q);
        if (v.price) totalValue += Math.abs(q) * v.price;
        if (isInbound && q > 0) {
          const cost = l.unitCost ? Number(l.unitCost.replace(',', '.')) : 0;
          if (Number.isFinite(cost) && cost > 0) totalCost += q * cost;
        }
        if (type === 'OUT' && l.unitPrice) {
          const price = Number(l.unitPrice.replace(',', '.'));
          if (Number.isFinite(price) && price > 0) totalRevenue += Math.abs(q) * price;
        }
      }
    }
    return { count, totalQty, totalValue, totalCost, totalRevenue };
  }, [lines, variantById, type]);

  const validateLines = (): { ok: boolean; message?: string } => {
    if (lines.length === 0) return { ok: false, message: 'Добавь хотя бы одну строку' };
    const seenVariants = new Set<string>();
    for (const l of lines) {
      if (!l.variantId) return { ok: false, message: 'Не во всех строках выбрана вариация' };
      if (seenVariants.has(l.variantId))
        return { ok: false, message: 'Одна и та же вариация выбрана несколько раз' };
      seenVariants.add(l.variantId);
      if (!l.qty.trim()) return { ok: false, message: 'Укажи количество в каждой строке' };
      const allowedFmt = meta.allowNegative ? /^-?\d+([.,]\d{1,3})?$/ : /^\d+([.,]\d{1,3})?$/;
      if (!allowedFmt.test(l.qty)) return { ok: false, message: `Количество в формате ${meta.allowNegative ? '−5 / 5' : '5 / 5.5'}` };
      const q = Number(l.qty.replace(',', '.'));
      if (q === 0) return { ok: false, message: 'Количество не может быть нулевым' };
      if (!meta.allowNegative && q <= 0)
        return { ok: false, message: 'Для прихода/списания число должно быть положительным' };
    }
    return { ok: true };
  };

  const onSubmit = async () => {
    if (!type) return;
    const v = validateLines();
    if (!v.ok) {
      toast.error(v.message ?? 'Заполни все поля');
      return;
    }
    setSubmitting(true);
    try {
      // Pre-validate manual allocations
      for (const l of lines) {
        if (l.manualAllocations && l.manualAllocations.length > 0) {
          const totalAlloc = l.manualAllocations.reduce(
            (s, a) => s + (a.qty ? Number(a.qty.replace(',', '.')) : 0),
            0,
          );
          const expected = Math.abs(Number(l.qty.replace(',', '.')));
          if (Math.abs(totalAlloc - expected) > 0.0001) {
            toast.error(
              `Сумма по партиям (${totalAlloc}) не совпадает с количеством строки (${expected})`,
            );
            setSubmitting(false);
            return;
          }
        }
      }

      await api.movements.batch({
        type,
        ...(type === 'IN' && counterpartyId ? { supplierId: counterpartyId } : {}),
        ...(type === 'OUT' && counterpartyId ? { customerId: counterpartyId } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        date: moldovaLocalToIso(date),
        lines: lines.map((l) => {
          const qty = Number(l.qty.replace(',', '.'));
          const isPositive = type === 'IN' || (type === 'ADJUST' && qty > 0);
          const cost = l.unitCost ? Number(l.unitCost.replace(',', '.')) : 0;
          // unitPrice — только для OUT/ADJUST-: фактическая цена за единицу.
          const priceRaw = l.unitPrice ? Number(l.unitPrice.replace(',', '.')) : NaN;
          const includeUnitPrice =
            !isPositive && Number.isFinite(priceRaw) && priceRaw >= 0;
          const lotAllocations =
            !isPositive && l.manualAllocations && l.manualAllocations.length > 0
              ? l.manualAllocations.map((a) => ({
                  lotId: a.lotId,
                  quantity: Number(a.qty.replace(',', '.')),
                }))
              : undefined;
          return {
            variantId: l.variantId!,
            quantity: qty,
            ...(isPositive && Number.isFinite(cost) ? { unitCost: cost } : {}),
            ...(includeUnitPrice ? { unitPrice: priceRaw } : {}),
            ...(lotAllocations ? { lotAllocations } : {}),
          };
        }),
      });
      toast.success(`${meta.title}: ${lines.length} ${pluralLines(lines.length)}`);
      onSaved();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Не удалось сохранить';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        dismissible={false}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-none md:w-[720px] lg:w-[820px]"
      >
        <SheetHeader className="flex-row items-start gap-3 border-b p-6">
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
              meta.iconClassName,
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <SheetTitle className="text-xl">{meta.title}</SheetTitle>
            <p className="mt-1 text-sm text-muted-foreground">{meta.subtitle}</p>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Header документа */}
          <div className="grid gap-4 md:grid-cols-2">
            {meta.counterparty !== 'none' && (
              <div className="space-y-1.5">
                <Label>{meta.counterparty === 'supplier' ? 'Поставщик' : 'Клиент'}</Label>
                <Combobox
                  options={counterpartyOptions}
                  value={counterpartyId}
                  onChange={setCounterpartyId}
                  placeholder={meta.counterparty === 'supplier' ? 'Выбрать поставщика' : 'Выбрать клиента'}
                  searchPlaceholder="Поиск по имени"
                  allowEmpty
                  emptyLabel={meta.counterparty === 'supplier' ? 'Без поставщика' : 'Без клиента'}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="movement-date">Дата и время</Label>
              <Input
                id="movement-date"
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          {/* Таблица строк */}
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-base">Позиции</Label>
              <span className="text-xs text-muted-foreground">
                {lines.length} {pluralLines(lines.length)}
              </span>
            </div>

            <div className="space-y-2">
              {lines.map((line, idx) => {
                const variant = line.variantId ? variantById.get(line.variantId) : null;
                const unit = variant?.product ? UNIT_LABEL[variant.product.unit] ?? '' : '';
                const qtyNum = line.qty ? Number(line.qty.replace(',', '.')) : 0;
                const showCostField =
                  type === 'IN' || (type === 'ADJUST' && qtyNum > 0);
                const showSalePriceField = type === 'OUT';
                const lineCost = line.unitCost ? Number(line.unitCost.replace(',', '.')) : 0;
                const lineSum =
                  Number.isFinite(qtyNum) && Number.isFinite(lineCost) ? Math.abs(qtyNum) * lineCost : 0;
                const linePrice = line.unitPrice ? Number(line.unitPrice.replace(',', '.')) : 0;
                const lineRevenue =
                  Number.isFinite(qtyNum) && Number.isFinite(linePrice)
                    ? Math.abs(qtyNum) * linePrice
                    : 0;
                return (
                  <div
                    key={line.key}
                    className="rounded-lg border bg-card p-2"
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex h-10 w-7 shrink-0 items-center justify-center text-xs text-muted-foreground">
                        {idx + 1}
                      </span>
                      <div className="flex-1 space-y-1">
                        <Combobox
                          options={variantOptions}
                          value={line.variantId}
                          onChange={(v) => {
                            // При смене variant: пересчитать auto-цену, если менеджер не правил вручную.
                            setLines((prev) =>
                              prev.map((l) => {
                                if (l.key !== line.key) return l;
                                const next = { ...l, variantId: v };
                                if (!l.priceTouched && type === 'OUT') {
                                  next.unitPrice = computeSalePrice(v);
                                }
                                return next;
                              }),
                            );
                          }}
                          onSearch={setSearchQuery}
                          loading={searching}
                          placeholder="Поиск товара или SKU"
                          searchPlaceholder="Введи название или SKU"
                          emptyText="Ничего не найдено"
                          emptyPlaceholderText="Начни печатать название или SKU"
                          triggerClassName="border-0 bg-transparent shadow-none hover:bg-accent/50 focus-visible:ring-1"
                        />
                        {variant && (
                          <p className="px-3 text-xs text-muted-foreground">
                            Остаток:{' '}
                            <span className="font-medium tabular-nums">
                              {variant.currentStock} {unit}
                            </span>
                            {variant.price !== null && (
                              <>
                                {' '}· продажная {formatPrice(variant.price)}
                              </>
                            )}
                          </p>
                        )}
                      </div>
                      <Input
                        type="text"
                        inputMode={meta.allowNegative ? 'text' : 'decimal'}
                        placeholder={meta.allowNegative ? '−5 / 10' : '10'}
                        value={line.qty}
                        onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                        className="w-24 text-right tabular-nums"
                        aria-label="Количество"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLine(line.key)}
                        disabled={lines.length === 1}
                        aria-label="Удалить строку"
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Цена продажи — только для отгрузки */}
                    {showSalePriceField && variant && (
                      <div className="mt-2 flex items-center gap-2 pl-9">
                        <Label
                          htmlFor={`price-${line.key}`}
                          className="shrink-0 text-xs font-normal text-muted-foreground"
                        >
                          Цена за единицу
                          {customerDiscount > 0 && !line.priceTouched && (
                            <span className="ml-1 text-emerald-700">
                              (со скидкой −{customerDiscount}%)
                            </span>
                          )}
                        </Label>
                        <Input
                          id={`price-${line.key}`}
                          type="text"
                          inputMode="decimal"
                          placeholder="0"
                          value={line.unitPrice}
                          onChange={(e) =>
                            updateLine(line.key, { unitPrice: e.target.value, priceTouched: true })
                          }
                          className="h-8 w-28 text-right text-xs tabular-nums"
                        />
                        {line.priceTouched && (
                          <button
                            type="button"
                            onClick={() =>
                              updateLine(line.key, {
                                priceTouched: false,
                                unitPrice: computeSalePrice(line.variantId),
                              })
                            }
                            className="text-xs text-muted-foreground hover:underline"
                            title="Вернуться к авто-расчёту"
                          >
                            авто
                          </button>
                        )}
                        {lineRevenue > 0 && (
                          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                            = {formatPrice(lineRevenue)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Закупочная цена — только для прихода */}
                    {showCostField && (
                      <div className="mt-2 flex items-center gap-2 pl-9">
                        <Label
                          htmlFor={`cost-${line.key}`}
                          className="shrink-0 text-xs font-normal text-muted-foreground"
                        >
                          Цена закупки за единицу
                        </Label>
                        <Input
                          id={`cost-${line.key}`}
                          type="text"
                          inputMode="decimal"
                          placeholder="0"
                          value={line.unitCost}
                          onChange={(e) => updateLine(line.key, { unitCost: e.target.value })}
                          className="h-8 w-28 text-right text-xs tabular-nums"
                        />
                        {lineSum > 0 && (
                          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                            = {formatPrice(lineSum)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Manual lot allocation для OUT/ADJUST- */}
                    {variant && (type === 'OUT' || (type === 'ADJUST' && qtyNum < 0)) && qtyNum !== 0 && (
                      <ManualLotAllocator
                        line={line}
                        absQty={Math.abs(qtyNum)}
                        unit={unit}
                        lots={lotsByVariant[variant.id] ?? null}
                        onLoad={() => fetchLots(variant.id)}
                        onChange={(next) => updateLine(line.key, { manualAllocations: next })}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={addLine}
              className="mt-2 w-full border-dashed"
            >
              <Plus className="mr-2 h-4 w-4" /> Добавить строку
            </Button>
          </div>

          {/* Заметка */}
          <div className="mt-6 space-y-1.5">
            <Label htmlFor="movement-note">
              Заметка
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                Будет привязана ко всем строкам
              </span>
            </Label>
            <Textarea
              id="movement-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Номер накладной, причина и т.п."
            />
          </div>
        </div>

        {/* Footer-сводка */}
        <div className="border-t bg-muted/30 px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">Позиций: </span>
                <span className="font-medium tabular-nums">{summary.count}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Кол-во: </span>
                <span className="font-medium tabular-nums">{summary.totalQty}</span>
              </div>
              {(type === 'IN' || type === 'ADJUST') && summary.totalCost > 0 && (
                <div>
                  <span className="text-muted-foreground">Закупка: </span>
                  <span className="font-medium tabular-nums">
                    {formatPrice(summary.totalCost)}
                  </span>
                </div>
              )}
              {type === 'OUT' ? (
                <div>
                  <span className="text-muted-foreground">Выручка: </span>
                  <span className="font-medium tabular-nums">
                    {formatPrice(summary.totalRevenue)}
                  </span>
                </div>
              ) : (
                <div>
                  <span className="text-muted-foreground">Розница: </span>
                  <span className="font-medium tabular-nums">
                    {formatPrice(summary.totalValue)}
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                <X className="mr-2 h-4 w-4" /> Отмена
              </Button>
              <Button type="button" onClick={onSubmit} disabled={submitting || summary.count === 0}>
                {submitting ? 'Сохраняю…' : meta.submitLabel}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function pluralLines(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'позиция';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'позиции';
  return 'позиций';
}

interface ManualLotAllocatorProps {
  line: Line;
  absQty: number;
  unit: string;
  lots: VariantLot[] | null;
  onLoad: () => Promise<VariantLot[]>;
  onChange: (next: Array<{ lotId: string; qty: string }> | null) => void;
}

function ManualLotAllocator({ line, absQty, unit, lots, onLoad, onChange }: ManualLotAllocatorProps) {
  const isManual = line.manualAllocations !== null;

  const toggleManual = async () => {
    if (isManual) {
      onChange(null);
      return;
    }
    // Загружаем lot'ы при первом включении.
    const loaded = lots ?? (await onLoad());
    if (loaded.length === 0) {
      onChange([]); // покажем пустое — пользователь увидит "нет активных партий"
      return;
    }
    // Префилл FIFO как стартовое распределение.
    let remaining = absQty;
    const initial: Array<{ lotId: string; qty: string }> = [];
    for (const lot of loaded) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, lot.remainingQuantity);
      initial.push({ lotId: lot.id, qty: String(take) });
      remaining -= take;
    }
    onChange(initial);
  };

  const updateAllocQty = (lotId: string, qty: string) => {
    const next = (line.manualAllocations ?? []).filter((a) => a.lotId !== lotId);
    if (qty.trim() && Number(qty.replace(',', '.')) > 0) {
      next.push({ lotId, qty });
    }
    onChange(next);
  };

  if (!isManual) {
    return (
      <div className="mt-2 flex items-center justify-between pl-9 text-xs">
        <span className="text-muted-foreground">FIFO: спишется с самых старых партий.</span>
        <button
          type="button"
          onClick={toggleManual}
          className="text-foreground underline-offset-2 hover:underline"
        >
          Распределить вручную
        </button>
      </div>
    );
  }

  const allocations = line.manualAllocations ?? [];
  const totalAlloc = allocations.reduce(
    (s, a) => s + (a.qty ? Number(a.qty.replace(',', '.')) : 0),
    0,
  );
  const balanced = Math.abs(totalAlloc - absQty) <= 0.0001;

  if (lots === null) {
    return <p className="mt-2 pl-9 text-xs text-muted-foreground">Загрузка партий…</p>;
  }
  if (lots.length === 0) {
    return (
      <div className="mt-2 pl-9 text-xs text-rose-700">
        У этой вариации нет активных партий с остатком.
      </div>
    );
  }

  return (
    <div className="mt-2 ml-9 rounded-md border bg-muted/30 p-2">
      <div className="flex items-center justify-between pb-2">
        <span className="text-xs font-medium">Распределение по партиям</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-muted-foreground hover:underline"
        >
          Вернуть FIFO
        </button>
      </div>
      <div className="space-y-1.5">
        {lots.map((lot) => {
          const current = allocations.find((a) => a.lotId === lot.id);
          return (
            <div key={lot.id} className="flex items-center gap-2 text-xs">
              <span className="w-24 shrink-0 text-muted-foreground">
                {formatDateTime(lot.receivedAt).slice(0, 10)}
              </span>
              <span className="flex-1 truncate">
                остаток <span className="tabular-nums font-medium">{lot.remainingQuantity}</span>{' '}
                {unit} · {formatPrice(lot.unitCost)}
              </span>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={current?.qty ?? ''}
                onChange={(e) => updateAllocQty(lot.id, e.target.value)}
                className="h-7 w-20 text-right text-xs tabular-nums"
                aria-label={`Кол-во из партии ${lot.id}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between border-t pt-2 text-xs">
        <span>
          Всего распределено:{' '}
          <span
            className={cn(
              'font-medium tabular-nums',
              balanced ? 'text-emerald-700' : 'text-rose-700',
            )}
          >
            {totalAlloc}
          </span>{' '}
          / {absQty} {unit}
        </span>
        {!balanced && (
          <span className="text-rose-700">
            {totalAlloc < absQty ? `не хватает ${absQty - totalAlloc}` : `избыток ${totalAlloc - absQty}`}
          </span>
        )}
      </div>
    </div>
  );
}
