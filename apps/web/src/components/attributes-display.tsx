import type { VariantAttributes } from '@art-garage/shared';

const KEY_LABELS: Record<string, string> = {
  color: 'Цвет',
  size: 'Размер',
  material: 'Материал',
  capacity: 'Объём',
};

/**
 * Цвета бутылок и т.п. часто приходят как названия типа "ROYAL BLUE".
 * Эта таблица — для известных слов; неизвестные просто покажем текстом без точки.
 */
const NAMED_COLORS: Record<string, string> = {
  BLACK: '#000000',
  WHITE: '#ffffff',
  RED: '#dc2626',
  BLUE: '#2563eb',
  'ROYAL BLUE': '#1d4ed8',
  'NAVY BLUE': '#1e3a8a',
  GREEN: '#16a34a',
  'FERN GREEN': '#4f7942',
  ORANGE: '#f97316',
  YELLOW: '#facc15',
  TRANSPARENT: 'transparent',
  NATURAL: '#e7d5b3',
  BLEU: '#2563eb',
};

function colorSwatch(value: string): string | null {
  const upper = value.toUpperCase();
  return NAMED_COLORS[upper] ?? null;
}

interface Props {
  attributes: VariantAttributes;
  inline?: boolean;
}

export function AttributesDisplay({ attributes, inline }: Props) {
  const entries = Object.entries(attributes);
  if (entries.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  return (
    <div className={inline ? 'flex flex-wrap items-center gap-1.5' : 'space-y-1'}>
      {entries.map(([key, value]) => {
        const swatch = key === 'color' ? colorSwatch(value) : null;
        return (
          <span
            key={key}
            className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-xs"
          >
            {swatch !== null && (
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border"
                style={{ background: swatch }}
              />
            )}
            <span className="truncate">
              {!inline && KEY_LABELS[key] && (
                <span className="text-muted-foreground">{KEY_LABELS[key]}: </span>
              )}
              {value}
            </span>
          </span>
        );
      })}
    </div>
  );
}
