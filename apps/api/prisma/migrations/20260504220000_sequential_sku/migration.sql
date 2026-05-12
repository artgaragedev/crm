ALTER TABLE "Category" ADD COLUMN "nextProductSeq" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Product" ADD COLUMN "code" TEXT;
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");
