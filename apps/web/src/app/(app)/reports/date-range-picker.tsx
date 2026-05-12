'use client';

import { useMemo, useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PRESET_LABELS,
  isoToYmd,
  presetRange,
  type DateRangePreset,
  type DateRange,
} from '@/lib/date-ranges';
import { moldovaTimeIso } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const PRESETS: DateRangePreset[] = [
  'today',
  'yesterday',
  'last7',
  'last30',
  'last90',
  'thisMonth',
  'lastMonth',
  'thisQuarter',
  'thisYear',
];

interface Props {
  value: DateRange;
  onChange: (value: DateRange) => void;
}

export function DateRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const fromYmd = useMemo(() => isoToYmd(value.from), [value.from]);
  const toYmd = useMemo(() => isoToYmd(value.to), [value.to]);

  // Подсветка активного пресета (если from/to ровно совпадают с расчётным диапазоном).
  const activePreset = useMemo<DateRangePreset | null>(() => {
    for (const p of PRESETS) {
      const r = presetRange(p);
      if (r.from === value.from && r.to === value.to) return p;
    }
    return null;
  }, [value.from, value.to]);

  const triggerLabel = activePreset
    ? PRESET_LABELS[activePreset]
    : `${formatYmd(fromYmd)} — ${formatYmd(toYmd)}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 gap-2 font-normal">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[28rem] p-0" align="start">
        <div className="grid grid-cols-2">
          <div className="border-r p-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onChange(presetRange(p));
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                  activePreset === p
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50',
                )}
              >
                {PRESET_LABELS[p]}
              </button>
            ))}
          </div>
          <div className="space-y-3 p-4">
            <div className="text-xs font-medium uppercase text-muted-foreground">
              Произвольный период
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dr-from" className="text-xs font-normal">
                С
              </Label>
              <Input
                id="dr-from"
                type="date"
                value={fromYmd}
                onChange={(e) => {
                  if (!e.target.value) return;
                  onChange({
                    from: moldovaTimeIso(e.target.value, 0, 0),
                    to: value.to,
                  });
                }}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dr-to" className="text-xs font-normal">
                По
              </Label>
              <Input
                id="dr-to"
                type="date"
                value={toYmd}
                onChange={(e) => {
                  if (!e.target.value) return;
                  onChange({
                    from: value.from,
                    to: moldovaTimeIso(e.target.value, 23, 59),
                  });
                }}
                className="h-9"
              />
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={() => setOpen(false)}
            >
              Применить
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatYmd(ymd: string): string {
  // 2026-05-12 → 12.05.2026
  const [y, m, d] = ymd.split('-');
  return `${d}.${m}.${y}`;
}
