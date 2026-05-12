import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Russian plural: pluralize(2, 'товар', 'товара', 'товаров') → 'товара' */
export function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/**
 * Валюта приложения. В одном месте — чтобы при смене не править разбросанные форматтеры.
 * MDL (молдавский лей). В быту записывается как "lei" или "L"; используем "lei".
 */
export const APP_CURRENCY = 'lei';

/** Format price like 1234.5 → "1 234,50 lei" (no suffix if currency = null) */
export function formatPrice(
  value: number | string | null | undefined,
  currency: string | null = APP_CURRENCY,
): string {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(num)) return '—';
  const formatted = num.toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${formatted} ${currency}` : formatted;
}

/** Часовой пояс приложения. CRM работает только по молдавскому времени. */
export const APP_TIMEZONE = 'Europe/Chisinau';

/** "01.05.2026, 14:32" в молдавском часовом поясе (независимо от TZ браузера). */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString('ru-RU', {
    timeZone: APP_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Превращает дату из date-picker'а ('YYYY-MM-DD') + час в ISO-строку UTC, такую что
 * при отображении в молдавском часовом поясе мы получим именно этот час этой даты.
 * Важно: TZ-смещение Молдовы зависит от DST (UTC+2 зимой, UTC+3 летом) — рассчитываем динамически.
 */
export function moldovaTimeIso(dateYmd: string, hour = 12, minute = 0): string {
  // 1. Берём кандидат — этот же момент в UTC.
  const candidate = new Date(`${dateYmd}T${pad2(hour)}:${pad2(minute)}:00Z`);
  // 2. Смотрим какое время этот UTC-момент показывает в Молдове.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(candidate);
  const moldovaHour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const moldovaMinute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  // 3. Дельта от целевого часа = размер смещения, который нужно убрать.
  const deltaMinutes =
    (moldovaHour * 60 + moldovaMinute) - (hour * 60 + minute);
  // 4. Возвращаем UTC-момент, сдвинутый назад на эту дельту.
  return new Date(candidate.getTime() - deltaMinutes * 60_000).toISOString();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** "2026-05-04" — сегодняшняя дата в молдавском TZ (для дефолтов date-picker'а). */
export function todayMoldovaYmd(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}

/** "2026-05-04T11:56" — текущая дата+время в молдавском TZ для <input type="datetime-local">. */
export function nowMoldovaLocal(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Парсит "2026-05-04T11:56" из datetime-local input и возвращает ISO для молдавского TZ. */
export function moldovaLocalToIso(localValue: string): string {
  // localValue вида "YYYY-MM-DDTHH:mm" (или с секундами).
  const [datePart, timePart = '12:00'] = localValue.split('T');
  const [hh = '12', mm = '0'] = timePart.split(':');
  return moldovaTimeIso(datePart!, Number(hh), Number(mm));
}

/** Форматирует количество со знаком: 5 → "+5", -3 → "−3". */
export function formatSigned(n: number, unit?: string): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? '+' : '−';
  return unit ? `${sign}${abs} ${unit}` : `${sign}${abs}`;
}
