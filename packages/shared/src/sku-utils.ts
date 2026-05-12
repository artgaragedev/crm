/** Базовая транслитерация кириллицы → латиница для генерации SKU/кодов. */
const CYR_TO_LAT: Record<string, string> = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'YO',
  Ж: 'ZH', З: 'Z', И: 'I', Й: 'Y', К: 'K', Л: 'L', М: 'M',
  Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', У: 'U',
  Ф: 'F', Х: 'KH', Ц: 'TS', Ч: 'CH', Ш: 'SH', Щ: 'SCH',
  Ъ: '', Ы: 'Y', Ь: '', Э: 'E', Ю: 'YU', Я: 'YA',
};

export function transliterate(s: string): string {
  let out = '';
  for (const ch of s) {
    const u = ch.toUpperCase();
    out += CYR_TO_LAT[u] !== undefined ? CYR_TO_LAT[u] : u;
  }
  return out;
}

/**
 * Превращает строку (с кириллицей или латиницей) в фрагмент для SKU:
 * UPPERCASE, только A-Z/0-9, пробелы → дефисы.
 */
export function sanitizeForSku(s: string): string {
  return transliterate(s)
    .replace(/[^A-Z0-9 ]+/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Подбирает короткий код-префикс для категории по имени.
 *   "Бутылки" → "BUT"
 *   "Sticle, cani, termosuri" → "SCT"
 *   "Notebook" → "NOT"
 *   "Кружки и термосы" → "KIT"
 */
export function suggestCategoryCode(name: string): string {
  const lat = transliterate(name).replace(/[^A-Z]+/g, ' ').trim();
  if (!lat) return '';
  const words = lat.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0]!.slice(0, 3);
  const initials = words.map((w) => w[0]).join('');
  if (initials.length >= 3) return initials.slice(0, 5);
  return (initials + words[0]!.slice(1)).slice(0, 3);
}

/** Длина числовой части артикула товара (KRU000001). */
export const PRODUCT_CODE_DIGITS = 6;
/** Максимальная длина префикса категории (или 3 буквы из имени, если нет категории). */
export const PRODUCT_CODE_PREFIX_LEN = 4;

/**
 * Префикс артикула. Если категория с кодом — берём её код (до 4 символов).
 * Иначе — 3 первые буквы из транслитерированного имени.
 *   buildProductCodePrefix("KRU", "Кружки фарфоровые") → "KRU"
 *   buildProductCodePrefix(null, "Notebook")           → "NOT"
 */
export function buildProductCodePrefix(
  categoryCode: string | null | undefined,
  productName: string,
): string {
  if (categoryCode) {
    return sanitizeForSku(categoryCode).slice(0, PRODUCT_CODE_PREFIX_LEN) || 'SKU';
  }
  const lat = sanitizeForSku(productName).replace(/-/g, '');
  return lat.slice(0, 3) || 'SKU';
}

/**
 * Артикул товара по префиксу и порядковому номеру: "KRU" + 1 → "KRU000001".
 */
export function buildProductCode(prefix: string, seq: number): string {
  return `${prefix}${String(seq).padStart(PRODUCT_CODE_DIGITS, '0')}`;
}

/**
 * SKU вариации = артикул товара + хвост из атрибутов: "KRU000001-RED" / "KRU000001-RED-M".
 * Хвосты обрезаются: цвет до 10 символов, размер до 8.
 */
export function buildVariantSku(
  productCode: string,
  color?: string | null,
  size?: string | null,
): string {
  const colorPart = color ? sanitizeForSku(color).slice(0, 10) : '';
  const sizePart = size ? sanitizeForSku(size).slice(0, 8) : '';
  const tail = [colorPart, sizePart].filter(Boolean).join('-');
  return tail ? `${productCode}-${tail}` : productCode;
}

/**
 * Полный кандидат SKU для предпросмотра в UI:
 *   buildSkuCandidate("Кружка", "RED", undefined, "KRU", 5)
 *     → "KRU000005-RED"
 *   buildSkuCandidate("Кружка", "RED")  // без категории и seq
 *     → "KRU000001-RED" (стаб с seq=1, реальный sequential назначит сервер)
 */
export function buildSkuCandidate(
  productName: string,
  color?: string | null,
  size?: string | null,
  categoryCode?: string | null,
  seq: number = 1,
): string {
  const prefix = buildProductCodePrefix(categoryCode, productName);
  const code = buildProductCode(prefix, seq);
  return buildVariantSku(code, color, size);
}
