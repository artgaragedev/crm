-- Композитный индекс для groupBy(variantId, type) в computeStocks и dashboard.summary.
-- Без него Postgres делает Index Scan по (variantId, createdAt) + HashAggregate по type,
-- что на больших таблицах StockMovement становится bottleneck'ом и держит коннект в пуле.
-- CONCURRENTLY не используется — Prisma оборачивает миграцию в транзакцию;
-- блокировка кратковременная (StockMovement без long-running writes на проде).
CREATE INDEX IF NOT EXISTS "StockMovement_variantId_type_idx"
  ON "StockMovement"("variantId", "type");
