/**
 * BOM для UTF-8. Excel без него читает кириллицу как абракадабру.
 * Префиксируется к финальному CSV перед отправкой.
 */
export const UTF8_BOM = '﻿';

/** Простой CSV-сериализатор: запятая-разделитель, экранирование двойными кавычками. */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCell).join(',')).join('\n');
}

function escapeCell(value: string): string {
  if (value === null || value === undefined) return '';
  const needsQuotes = /[",\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

/** Decimal-форматтер для денег: фиксированно 2 знака без локали — для машинного парсинга Excel. */
export function csvMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return value.toFixed(2);
}

/** Дата ISO без миллисекунд — Excel любит. */
export function csvDate(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (!Number.isFinite(d.getTime())) return '';
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
