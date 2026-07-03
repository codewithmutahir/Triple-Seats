-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('delivery', 'pickup', 'order_by_tray', 'full_service');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('b2b', 'b2c');

-- AlterTable: leads
ALTER TABLE "leads" ADD COLUMN "customerType" "CustomerType" NOT NULL DEFAULT 'b2c';

-- AlterTable: events
ALTER TABLE "events" ADD COLUMN "eventType" "EventType" NOT NULL DEFAULT 'full_service';
ALTER TABLE "events" ADD COLUMN "customerType" "CustomerType" NOT NULL DEFAULT 'b2c';

-- AlterTable: package_price_tiers
ALTER TABLE "package_price_tiers" ADD COLUMN "customerType" "CustomerType" NOT NULL DEFAULT 'b2c';

-- AlterTable: quotes default tax rate
ALTER TABLE "quotes" ALTER COLUMN "taxRate" SET DEFAULT 0.0875;

-- Drop old index and create composite index on package tiers
DROP INDEX IF EXISTS "package_price_tiers_packageId_idx";
CREATE INDEX "package_price_tiers_packageId_customerType_idx" ON "package_price_tiers"("packageId", "customerType");

-- Duplicate existing b2c tiers as b2b (same prices for now)
INSERT INTO "package_price_tiers" ("id", "packageId", "customerType", "minGuests", "maxGuests", "pricePerHead")
SELECT
  'b2b_' || "id",
  "packageId",
  'b2b'::"CustomerType",
  "minGuests",
  "maxGuests",
  "pricePerHead"
FROM "package_price_tiers"
WHERE "customerType" = 'b2c';
