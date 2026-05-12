-- AuditAction enum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE');

-- Soft-delete columns
ALTER TABLE "Category"  ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Product"   ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Customer"  ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Supplier"  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Category_deletedAt_idx"  ON "Category"  ("deletedAt");
CREATE INDEX "Product_deletedAt_idx"   ON "Product"   ("deletedAt");
CREATE INDEX "Customer_deletedAt_idx"  ON "Customer"  ("deletedAt");
CREATE INDEX "Supplier_deletedAt_idx"  ON "Supplier"  ("deletedAt");

-- Per-variant reorder level
ALTER TABLE "ProductVariant" ADD COLUMN "reorderLevel" INTEGER;

-- Storno self-relation on StockMovement
ALTER TABLE "StockMovement" ADD COLUMN "reversesId" TEXT;
CREATE UNIQUE INDEX "StockMovement_reversesId_key" ON "StockMovement" ("reversesId");
ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_reversesId_fkey"
  FOREIGN KEY ("reversesId") REFERENCES "StockMovement" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AuditLog
CREATE TABLE "AuditLog" (
  "id"        TEXT NOT NULL,
  "entity"    TEXT NOT NULL,
  "entityId"  TEXT NOT NULL,
  "action"    "AuditAction" NOT NULL,
  "userId"    TEXT,
  "before"    JSONB,
  "after"     JSONB,
  "note"      TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_entity_entityId_createdAt_idx" ON "AuditLog" ("entity", "entityId", "createdAt");
CREATE INDEX "AuditLog_userId_createdAt_idx"          ON "AuditLog" ("userId", "createdAt");

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
