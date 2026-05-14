-- Soft-deleted товары не должны "удерживать" имена и артикулы.
-- Меняем глобальный UNIQUE на partial unique, действующий только среди живых строк (deletedAt IS NULL).
-- Это позволяет пересоздать товар с тем же именем после удаления старого, не нарушая историю движений.

-- DropIndex
DROP INDEX IF EXISTS "Product_name_key";
DROP INDEX IF EXISTS "Product_code_key";

-- CreateIndex
CREATE UNIQUE INDEX "Product_name_active_key" ON "Product"("name") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "Product_code_active_key" ON "Product"("code") WHERE "deletedAt" IS NULL;
