-- Quote builder schema: status, tax/deposit, line item enums

CREATE TYPE "QuoteStatus" AS ENUM ('draft', 'sent', 'accepted', 'declined');
CREATE TYPE "ItemCategory" AS ENUM ('appetizer', 'main_course', 'bbq', 'dessert', 'equipment', 'delivery', 'other');
CREATE TYPE "QuoteUnit" AS ENUM ('per_head', 'by_tray', 'flat');

-- Quotes: add new columns
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "status" "QuoteStatus" NOT NULL DEFAULT 'draft';
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0.085;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "depositPct" DOUBLE PRECISION NOT NULL DEFAULT 0.5;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);

UPDATE "quotes" SET "dueDate" = "validUntil" WHERE "dueDate" IS NULL AND "validUntil" IS NOT NULL;

-- Convert totalAmount to float (grand total)
ALTER TABLE "quotes" ALTER COLUMN "totalAmount" DROP DEFAULT;
ALTER TABLE "quotes" ALTER COLUMN "totalAmount" TYPE DOUBLE PRECISION USING COALESCE("totalAmount"::double precision, 0);
ALTER TABLE "quotes" ALTER COLUMN "totalAmount" SET DEFAULT 0;

ALTER TABLE "quotes" DROP CONSTRAINT IF EXISTS "quotes_catererId_quoteNumber_version_key";
ALTER TABLE "quotes" DROP COLUMN IF EXISTS "quoteNumber";
ALTER TABLE "quotes" DROP COLUMN IF EXISTS "version";
ALTER TABLE "quotes" DROP COLUMN IF EXISTS "validUntil";
ALTER TABLE "quotes" DROP COLUMN IF EXISTS "subtotal";
ALTER TABLE "quotes" DROP COLUMN IF EXISTS "taxAmount";
ALTER TABLE "quotes" DROP COLUMN IF EXISTS "discountAmount";

CREATE INDEX IF NOT EXISTS "quotes_catererId_idx" ON "quotes"("catererId");
CREATE INDEX IF NOT EXISTS "quotes_eventId_idx" ON "quotes"("eventId");

-- Line items
ALTER TABLE "quote_line_items" ADD COLUMN IF NOT EXISTS "notes" TEXT;

ALTER TABLE "quote_line_items" ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::double precision;
ALTER TABLE "quote_line_items" ALTER COLUMN "unitPrice" TYPE DOUBLE PRECISION USING "unitPrice"::double precision;

ALTER TABLE "quote_line_items" ALTER COLUMN "category" TYPE "ItemCategory" USING (
  CASE lower("category")
    WHEN 'appetizer' THEN 'appetizer'::"ItemCategory"
    WHEN 'main_course' THEN 'main_course'::"ItemCategory"
    WHEN 'main course' THEN 'main_course'::"ItemCategory"
    WHEN 'bbq' THEN 'bbq'::"ItemCategory"
    WHEN 'dessert' THEN 'dessert'::"ItemCategory"
    WHEN 'equipment' THEN 'equipment'::"ItemCategory"
    WHEN 'delivery' THEN 'delivery'::"ItemCategory"
    ELSE 'other'::"ItemCategory"
  END
);

ALTER TABLE "quote_line_items" ALTER COLUMN "unitType" TYPE "QuoteUnit" USING (
  CASE "unitType"::text
    WHEN 'per_head' THEN 'per_head'::"QuoteUnit"
    WHEN 'by_tray' THEN 'by_tray'::"QuoteUnit"
    ELSE 'flat'::"QuoteUnit"
  END
);

CREATE INDEX IF NOT EXISTS "quote_line_items_quoteId_idx" ON "quote_line_items"("quoteId");
