'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
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

export interface MultiSelectOption {
  value: string;
  label: string;
  searchValue?: string;
}

interface Props {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  triggerClassName?: string;
  emptyText?: string;
}

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Все',
  searchPlaceholder = 'Поиск',
  triggerClassName,
  emptyText = 'Ничего не найдено',
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = new Set(value);

  const summary =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? options.find((o) => o.value === value[0])?.label ?? '1'
        : `${value.length} выбрано`;

  const toggle = (id: string) => {
    if (selected.has(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'h-9 justify-between gap-2 px-3 text-left font-normal',
            value.length === 0 && 'text-muted-foreground',
            triggerClassName,
          )}
        >
          <span className="truncate">{summary}</span>
          {value.length > 0 ? (
            <button
              type="button"
              aria-label="Очистить"
              className="text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[16rem] p-0"
        align="start"
      >
        <Command
          filter={(v, search) => (v.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.searchValue ?? option.label}
                  onSelect={() => toggle(option.value)}
                >
                  <Check
                    className={cn(
                      'h-4 w-4',
                      selected.has(option.value) ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
