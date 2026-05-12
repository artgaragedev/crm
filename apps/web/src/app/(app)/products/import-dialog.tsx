'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ProductUnit } from '@art-garage/shared';
import { api, ApiError, type ImportReport, type ImportRow } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
}

const SAMPLE = `productName,unit,categoryName,sku,color,price,initialStock,supplierName
BOTTLE TURMAN,PCS,"Sticle, cani, termosuri",TURMAN-BLACK,BLACK,80,36,
BOTTLE COLBY,PCS,"Sticle, cani, termosuri",COLBY-RED2,RED,99.5,133,
BOTTLE COLBY,PCS,"Sticle, cani, termosuri",COLBY-BLACK2,BLACK,99.5,200,`;

export function ImportDialog({ open, onOpenChange, onImported }: Props) {
  const [csv, setCsv] = useState('');
  const [parsed, setParsed] = useState<ImportRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setCsv('');
    setParsed(null);
    setParseError(null);
    setReport(null);
  };

  const handleFileUpload = async (file: File) => {
    const text = await file.text();
    setCsv(text);
    parseCsv(text);
  };

  const parseCsv = (text: string) => {
    setParseError(null);
    setReport(null);
    try {
      const rows = parseCsvText(text);
      setParsed(rows);
    } catch (err) {
      setParsed(null);
      setParseError(err instanceof Error ? err.message : 'Не удалось разобрать CSV');
    }
  };

  const handleImport = async () => {
    if (!parsed || parsed.length === 0) return;
    setSubmitting(true);
    try {
      const r = await api.importer.variants(parsed);
      setReport(r);
      toast.success(
        `Создано: ${r.variantsCreated} вариаций, ${r.productsCreated} товаров, ${r.initialStocksCreated} приходов`,
      );
      if (r.errors.length === 0) onImported();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Не удалось импортировать';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Импорт товаров и вариаций</DialogTitle>
          <DialogDescription>
            CSV с заголовком. Колонки: productName, unit (PCS/KG/L/M/PACK), categoryName, sku,
            color, price, initialStock, supplierName, description, reorderLevel. SKU должен быть
            уникальным.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFileUpload(f);
                if (fileRef.current) fileRef.current.value = '';
              }}
            />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              Загрузить файл
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setCsv(SAMPLE);
                parseCsv(SAMPLE);
              }}
            >
              Вставить пример
            </Button>
          </div>

          <Textarea
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              if (e.target.value.trim()) parseCsv(e.target.value);
              else {
                setParsed(null);
                setParseError(null);
              }
            }}
            placeholder="Вставь CSV сюда или загрузи файл выше"
            rows={10}
            className="font-mono text-xs"
          />

          {parseError && <p className="text-sm text-destructive">{parseError}</p>}

          {parsed && parsed.length > 0 && !report && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              Готово к импорту: <strong>{parsed.length}</strong> строк
            </div>
          )}

          {report && (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  Товаров создано: <strong>{report.productsCreated}</strong>
                </div>
                <div>
                  Использовано существующих: <strong>{report.productsReused}</strong>
                </div>
                <div>
                  Вариаций создано: <strong>{report.variantsCreated}</strong>
                </div>
                <div>
                  Стартовых остатков: <strong>{report.initialStocksCreated}</strong>
                </div>
              </div>
              {report.errors.length > 0 && (
                <div className="space-y-1">
                  <p className="font-medium text-destructive">Ошибок: {report.errors.length}</p>
                  <ul className="max-h-40 space-y-0.5 overflow-auto text-xs text-destructive">
                    {report.errors.map((e, i) => (
                      <li key={i}>
                        Строка {e.row}
                        {e.sku ? ` (${e.sku})` : ''}: {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {report ? 'Закрыть' : 'Отмена'}
          </Button>
          {!report && (
            <Button
              type="button"
              onClick={handleImport}
              disabled={submitting || !parsed || parsed.length === 0}
            >
              {submitting ? 'Импортирую…' : `Импортировать ${parsed?.length ?? 0}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Минималистичный CSV-парсер: разделитель — запятая, поддерживает двойные кавычки и эскейп "".
 * Заголовок обязателен. Возвращает массив ImportRow.
 */
function parseCsvText(text: string): ImportRow[] {
  const lines = splitCsvLines(text.trim());
  if (lines.length < 2) throw new Error('CSV должен содержать заголовок и минимум одну строку');

  const headers = parseLine(lines[0]!).map((h) => h.trim());
  const rows: ImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const values = parseLine(line);
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]!] = (values[j] ?? '').trim();
    }
    rows.push(toImportRow(obj, i + 1));
  }
  return rows;
}

function toImportRow(o: Record<string, string>, rowNum: number): ImportRow {
  if (!o.productName) throw new Error(`Строка ${rowNum}: пустое productName`);
  if (!o.sku) throw new Error(`Строка ${rowNum}: пустое sku`);
  return {
    productName: o.productName,
    unit: (o.unit?.toUpperCase() || undefined) as ProductUnit | undefined,
    categoryName: o.categoryName || null,
    sku: o.sku,
    color: o.color || undefined,
    price: o.price ? Number(o.price.replace(',', '.')) : null,
    reorderLevel: o.reorderLevel ? Number(o.reorderLevel) : null,
    initialStock: o.initialStock ? Number(o.initialStock.replace(',', '.')) : undefined,
    supplierName: o.supplierName || null,
    description: o.description || undefined,
  };
}

/** Учитывает кавычки при разбиении на строки (новые строки внутри кавычек). */
function splitCsvLines(text: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && text[i + 1] === '"') {
      current += '""';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      if (current.length > 0) out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.length > 0) out.push(current);
  return out;
}

function parseLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      current += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch ?? '';
  }
  out.push(current);
  return out;
}
