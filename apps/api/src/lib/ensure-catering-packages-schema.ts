import { prisma } from "@tripeseats/database";

let ensured = false;

/** Ensures catering package tables/columns exist (pooler-safe patches). Runs once per process. */
export async function ensureCateringPackagesSchema() {
  if (ensured) return;
  try {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'catering_packages'
    `;
    if (tables.length > 0) {
      ensured = true;
      return;
    }

    await prisma.$executeRawUnsafe(
      `ALTER TYPE "QuoteUnit" ADD VALUE IF NOT EXISTS 'tiered_per_head'`
    );

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "catering_packages" (
        "id" TEXT NOT NULL,
        "catererId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        "minGuests" INTEGER NOT NULL DEFAULT 200,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "catering_packages_pkey" PRIMARY KEY ("id")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "package_price_tiers" (
        "id" TEXT NOT NULL,
        "packageId" TEXT NOT NULL,
        "minGuests" INTEGER NOT NULL,
        "maxGuests" INTEGER,
        "pricePerHead" DOUBLE PRECISION NOT NULL,
        CONSTRAINT "package_price_tiers_pkey" PRIMARY KEY ("id")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "package_included_items" (
        "id" TEXT NOT NULL,
        "packageId" TEXT NOT NULL,
        "label" TEXT NOT NULL,
        "quantity" INTEGER NOT NULL DEFAULT 1,
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "package_included_items_pkey" PRIMARY KEY ("id")
      )
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "quote_line_items"
        ADD COLUMN IF NOT EXISTS "packageId" TEXT,
        ADD COLUMN IF NOT EXISTS "appliedTier" DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS "appliedTierLabel" TEXT
    `);

    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "catering_packages_catererId_idx" ON "catering_packages"("catererId")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "package_price_tiers_packageId_idx" ON "package_price_tiers"("packageId")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "package_included_items_packageId_idx" ON "package_included_items"("packageId")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "quote_line_items_packageId_idx" ON "quote_line_items"("packageId")`
    );

    ensured = true;
    console.log("[db] Patched catering packages schema.");
  } catch (e) {
    console.warn("[db] catering packages schema patch skipped:", e);
  }
}
