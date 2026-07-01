-- AlterTable: migrate menu_items to smart catalog schema
ALTER TABLE "menu_items" DROP CONSTRAINT IF EXISTS "menu_items_catererId_name_key";
DROP INDEX IF EXISTS "menu_items_catererId_name_key";
DROP INDEX IF EXISTS "menu_items_catererId_category_isActive_idx";

ALTER TABLE "menu_items" ALTER COLUMN "category" TYPE "ItemCategory" USING "category"::"ItemCategory";

ALTER TABLE "menu_items" ALTER COLUMN "defaultPrice" DROP NOT NULL;
ALTER TABLE "menu_items" ALTER COLUMN "defaultPrice" TYPE DOUBLE PRECISION USING "defaultPrice"::double precision;

ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "defaultUnit" "QuoteUnit" NOT NULL DEFAULT 'per_head';
UPDATE "menu_items" SET "defaultUnit" = "defaultUnitType"::text::"QuoteUnit" WHERE "defaultUnitType" IS NOT NULL;
ALTER TABLE "menu_items" DROP COLUMN IF EXISTS "defaultUnitType";

ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "usageCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "menu_items" DROP COLUMN IF EXISTS "description";
ALTER TABLE "menu_items" DROP COLUMN IF EXISTS "isActive";

CREATE UNIQUE INDEX "menu_items_catererId_category_name_key" ON "menu_items"("catererId", "category", "name");
CREATE INDEX "menu_items_catererId_category_idx" ON "menu_items"("catererId", "category");
