-- Customer: постоянная скидка клиента, default 0
ALTER TABLE "Customer" ADD COLUMN "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- StockMovement: фактическая цена продажи + замороженная скидка в момент сделки
ALTER TABLE "StockMovement" ADD COLUMN "unitPrice" DECIMAL(12,2);
ALTER TABLE "StockMovement" ADD COLUMN "discountPercent" DECIMAL(5,2);

-- Индексы для аналитики (отчёты по клиенту, поставщику, менеджеру за период)
CREATE INDEX "StockMovement_customerId_createdAt_idx" ON "StockMovement"("customerId", "createdAt");
CREATE INDEX "StockMovement_supplierId_createdAt_idx" ON "StockMovement"("supplierId", "createdAt");
CREATE INDEX "StockMovement_userId_createdAt_idx" ON "StockMovement"("userId", "createdAt");
