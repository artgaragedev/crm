ALTER TABLE "Category" ADD COLUMN "code" TEXT;
CREATE UNIQUE INDEX "Category_code_key" ON "Category"("code");
