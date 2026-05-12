// Все хелперы живут в shared, чтобы клиент и сервер использовали один и тот же алгоритм.
export {
  buildSkuCandidate,
  buildVariantSku,
  buildProductCode,
  buildProductCodePrefix,
  suggestCategoryCode,
  sanitizeForSku,
  transliterate,
} from '@art-garage/shared';
