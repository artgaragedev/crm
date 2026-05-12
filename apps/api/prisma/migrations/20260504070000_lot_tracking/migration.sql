-- StockMovement.totalCost
ALTER TABLE "StockMovement" ADD COLUMN "totalCost" DECIMAL(14, 2);

-- StockLot
CREATE TABLE "StockLot" (
  "id"                  TEXT NOT NULL,
  "variantId"           TEXT NOT NULL,
  "unitCost"            DECIMAL(12, 2) NOT NULL,
  "initialQuantity"     DECIMAL(14, 3) NOT NULL,
  "remainingQuantity"   DECIMAL(14, 3) NOT NULL,
  "receivedAt"          TIMESTAMP(3) NOT NULL,
  "supplierId"          TEXT,
  "note"                TEXT,
  "userId"              TEXT NOT NULL,
  "createdByMovementId" TEXT NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockLot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockLot_createdByMovementId_key" ON "StockLot"("createdByMovementId");
CREATE INDEX "StockLot_variantId_receivedAt_idx" ON "StockLot"("variantId", "receivedAt");
CREATE INDEX "StockLot_variantId_remainingQuantity_idx" ON "StockLot"("variantId", "remainingQuantity");

ALTER TABLE "StockLot"
  ADD CONSTRAINT "StockLot_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockLot"
  ADD CONSTRAINT "StockLot_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StockLot"
  ADD CONSTRAINT "StockLot_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockLot"
  ADD CONSTRAINT "StockLot_createdByMovementId_fkey"
  FOREIGN KEY ("createdByMovementId") REFERENCES "StockMovement"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- LotConsumption
CREATE TABLE "LotConsumption" (
  "id"         TEXT NOT NULL,
  "lotId"      TEXT NOT NULL,
  "movementId" TEXT NOT NULL,
  "quantity"   DECIMAL(14, 3) NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LotConsumption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LotConsumption_lotId_idx"      ON "LotConsumption"("lotId");
CREATE INDEX "LotConsumption_movementId_idx" ON "LotConsumption"("movementId");

ALTER TABLE "LotConsumption"
  ADD CONSTRAINT "LotConsumption_lotId_fkey"
  FOREIGN KEY ("lotId") REFERENCES "StockLot"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LotConsumption"
  ADD CONSTRAINT "LotConsumption_movementId_fkey"
  FOREIGN KEY ("movementId") REFERENCES "StockMovement"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
