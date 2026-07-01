/**
 * Applies menu_items schema changes when Prisma migrate can't reach DIRECT_URL.
 * Safe to re-run (uses IF NOT EXISTS / IF EXISTS).
 */
import "dotenv/config";

import { prisma } from "@tripeseats/database";

const statements = [
  `ALTER TABLE "menu_items" DROP CONSTRAINT IF EXISTS "menu_items_catererId_name_key"`,
  `DROP INDEX IF EXISTS "menu_items_catererId_name_key"`,
  `DROP INDEX IF EXISTS "menu_items_catererId_category_isActive_idx"`,
  `DO $$ BEGIN
    ALTER TABLE "menu_items" ALTER COLUMN "category" TYPE "ItemCategory" USING "category"::"ItemCategory";
  EXCEPTION WHEN others THEN NULL;
  END $$`,
  `ALTER TABLE "menu_items" ALTER COLUMN "defaultPrice" DROP NOT NULL`,
  `ALTER TABLE "menu_items" ALTER COLUMN "defaultPrice" TYPE DOUBLE PRECISION USING "defaultPrice"::double precision`,
  `ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "defaultUnit" "QuoteUnit" NOT NULL DEFAULT 'per_head'`,
  `UPDATE "menu_items" SET "defaultUnit" = "defaultUnitType"::text::"QuoteUnit" WHERE "defaultUnitType" IS NOT NULL`,
  `ALTER TABLE "menu_items" DROP COLUMN IF EXISTS "defaultUnitType"`,
  `ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "usageCount" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "menu_items" DROP COLUMN IF EXISTS "description"`,
  `ALTER TABLE "menu_items" DROP COLUMN IF EXISTS "isActive"`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "menu_items_catererId_category_name_key" ON "menu_items"("catererId", "category", "name")`,
  `CREATE INDEX IF NOT EXISTS "menu_items_catererId_category_idx" ON "menu_items"("catererId", "category")`
];

async function main() {
  console.log("Applying menu_items schema patches...");
  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log("OK:", sql.slice(0, 60).replace(/\s+/g, " ") + "...");
    } catch (e) {
      console.warn("Skip or failed:", sql.slice(0, 40), e);
    }
  }
  const cols = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'menu_items' AND column_name = 'defaultUnit'
  `;
  if (cols.length === 0) {
    console.error("Migration incomplete: defaultUnit column still missing.");
    process.exit(1);
  }
  console.log("menu_items schema ready.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
