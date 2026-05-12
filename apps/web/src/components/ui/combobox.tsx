'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
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
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-10 w-full justify-between gap-2 px-3 text-left font-normal',
            !selected && 'text-muted-foreground',
            triggerClassName,
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn('w-[var(--radix-popover-trigger-width)] p-0', className)}
        align="start"
      >
        <Command
          filter={(value, search) => {
            // Кастомный фильтр: ищем по value (там у нас сложенный searchValue)
            return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
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
