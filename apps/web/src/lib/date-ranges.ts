import { moldovaTimeIso, todayMoldovaYmd } from './utils';

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'last90'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'thisYear';

export interface DateRange {
  /** ISO datetime, начало диапазона в молдавском TZ (00:00). */
  from: string;
  /** ISO datetime, конец диапазона в молдавском TZ (23:59). */
  to: string;
}

function ymdToParts(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.split('-').map(Number);
  return [y ?? 0, (m ?? 1) - 1, d ?? 1];
}

function partsToYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Возвращает ISO-диапазон для пресета относительно сегодняшней даты в Молдове. */
export function presetRange(preset: DateRangePreset): DateRange {
  const todayYmd = todayMoldovaYmd();
  const [y, m, d] = ymdToParts(todayYmd);
  const todayLocal = new Date(y, m, d);

  let fromYmd = todayYmd;
  let toYmd = todayYmd;

  switch (preset) {
    case 'today':
      break;
    case 'yesterday': {
      const t = new Date(todayLocal);
      t.setDate(t.getDate() - 1);
      fromYmd = toYmd = partsToYmd(t.getFullYear(), t.getMonth(), t.getDate());
      break;
    }
    case 'last7': {
      const t = new Date(todayLocal);
      t.setDate(t.getDate() - 6);
      fromYmd = partsToYmd(t.getFullYear(), t.getMonth(), t.getDate());
      break;
    }
    case 'last30': {
      const t = new Date(todayLocal);
      t.setDate(t.getDate() - 29);
      fromYmd = partsToYmd(t.getFullYear(), t.getMonth(), t.getDate());
      break;
    }
    case 'last90': {
      const t = new Date(todayLocal);
      t.setDate(t.getDate() - 89);
      fromYmd = partsToYmd(t.getFullYear(), t.getMonth(), t.getDate());
      break;
    }
    case 'thisMonth': {
      fromYmd = partsToYmd(y, m, 1);
      break;
    }
    case 'lastMonth': {
      const first = new Date(y, m - 1, 1);
      const last = new Date(y, m, 0); // day 0 of current month = last day of prev
      fromYmd = partsToYmd(first.getFullYear(), first.getMonth(), first.getDate());
      toYmd = partsToYmd(last.getFullYear(), last.getMonth(), last.getDate());
      break;
    }
    case 'thisQuarter': {
      const qStart = Math.floor(m / 3) * 3;
      fromYmd = partsToYmd(y, qStart, 1);
      break;
    }
    case 'thisYear': {
      fromYmd = partsToYmd(y, 0, 1);
      break;
    }
  }

  return {
    from: moldovaTimeIso(fromYmd, 0, 0),
    to: moldovaTimeIso(toYmd, 23, 59),
  };
}

/** Парсит YMD из ISO для preset-сравнения (когда пользователь зашёл и выбрал custom). */
export function isoToYmd(iso: string): string {
  // Получаем YMD в MD TZ из произвольной ISO-строки
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Chisinau',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(d);
}

export const PRESET_LABELS: Record<DateRangePreset, string> = {
  today: 'Сегодня',
  yesterday: 'Вчера',
  last7: 'Последние 7 дней',
  last30: 'Последние 30 дней',
  last90: 'Последние 90 дней',
  thisMonth: 'Этот месяц',
  lastMonth: 'Прошлый месяц',
  thisQuarter: 'Этот квартал',
  thisYear: 'Этот год',
};
