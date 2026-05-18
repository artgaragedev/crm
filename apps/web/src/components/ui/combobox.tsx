'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Что показывать в строке выпадашки если хотим отличный от label вид */
  searchValue?: string;
  /** Дополнительный аннотатор справа (например, остаток) */
  hint?: React.ReactNode;
  /** Доп. подстрока под labelом */
  description?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  emptyText?: string;
  searchPlaceholder?: string;
  /** Разрешить очистить выбор (показывает "Не выбрано" пункт) */
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
  /**
   * Если задан — Combobox работает в режиме server-side search: при вводе вызывается этот колбэк,
   * локальный фильтр cmdk отключается, options ожидаются уже отфильтрованными родителем.
   * Дебаунс — на стороне родителя.
   */
  onSearch?: (query: string) => void;
  /** Показать индикатор загрузки в списке (актуально с onSearch). */
  loading?: boolean;
  /** Текст, когда строка поиска пуста (актуально с onSearch). По дефолту совпадает с emptyText. */
  emptyPlaceholderText?: string;
  /**
   * Если value задан но НЕ в options (typical для server-side search: options меняются с каждым
   * поиском, ранее выбранный value пропадает из них) — берём info для trigger label отсюда.
   * В дропдауне этот option НЕ показывается, только в triggere.
   */
  selectedFallback?: ComboboxOption | null;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = 'Выбрать...',
  emptyText = 'Ничего не найдено',
  searchPlaceholder = 'Поиск...',
  allowEmpty = false,
  emptyLabel = 'Не выбрано',
  className,
  triggerClassName,
  disabled,
  onSearch,
  loading,
  emptyPlaceholderText,
  selectedFallback,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  // Trigger label: сначала ищем в options (текущий dropdown), потом — fallback. Fallback нужен
  // когда server-side search перетёр options, но value всё ещё валиден.
  const selected =
    options.find((o) => o.value === value) ??
    (value != null && selectedFallback?.value === value ? selectedFallback : undefined);
  const serverSide = typeof onSearch === 'function';

  // Сброс строки поиска при закрытии — чтобы при следующем открытии не "залипал" старый текст.
  useEffect(() => {
    if (!open) setSearch('');
  }, [open]);

  // Прокидываем строку поиска родителю — он сам решит, делать ли запрос и с каким debounce.
  useEffect(() => {
    if (!serverSide) return;
    onSearch?.(search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, serverSide]);

  return (
    // modal=true — без этого Popover внутри Radix Dialog (Sheet) теряет клики на items:
    // DismissableLayer Sheet'а перехватывает pointerdown как outside-interaction, и onSelect
    // у CommandItem не успевает выстрелить. Известный issue (radix-ui/primitives#1574).
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-auto min-h-10 w-full justify-between gap-2 px-3 py-2 text-left font-normal',
            !selected && 'text-muted-foreground',
            triggerClassName,
          )}
        >
          {selected ? (
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{selected.label}</span>
              {selected.description && (
                <span className="truncate text-xs text-muted-foreground">
                  {selected.description}
                </span>
              )}
            </span>
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn('w-[var(--radix-popover-trigger-width)] p-0', className)}
        align="start"
        onWheel={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        // preventDefault — не возвращаем focus на trigger при закрытии:
        // при возврате фокуса в Sheet иногда срабатывает повторный outside-click handler
        // и Popover тут же снова закрывается, либо click "съедается".
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <Command
          shouldFilter={!serverSide}
          filter={
            serverSide
              ? undefined
              : (value, search) =>
                  value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Ищу…
              </div>
            ) : (
              <CommandEmpty>
                {serverSide && search.length === 0
                  ? emptyPlaceholderText ?? 'Начни печатать для поиска…'
                  : emptyText}
              </CommandEmpty>
            )}
            {/* Во время server-side загрузки скрываем устаревшие options, чтобы не путать юзера. */}
            <CommandGroup className={cn(loading && 'hidden')}>
              {allowEmpty && (
                <CommandItem
                  value="__empty__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn('h-4 w-4', !value ? 'opacity-100' : 'opacity-0')}
                  />
                  <span className="text-muted-foreground">{emptyLabel}</span>
                </CommandItem>
              )}
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.searchValue ?? option.label}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn('h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')}
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{option.label}</span>
                    {option.description && (
                      <span className="truncate text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    )}
                  </div>
                  {option.hint && (
                    <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
                      {option.hint}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
