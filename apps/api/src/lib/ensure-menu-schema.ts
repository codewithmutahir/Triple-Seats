import { prisma } from "@tripeseats/database";

let ensured = false;

const statements = [
  `ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "defaultUnit" "QuoteUnit" NOT NULL DEFAULT 'per_head'`,
  `ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "usageCount" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "menu_items_catererId_category_name_key" ON "menu_items"("catererId", "category", "name")`,
  `CREATE INDEX IF NOT EXISTS "menu_items_catererId_category_idx" ON "menu_items"("catererId", "category")`
];

/** Ensures menu_items columns exist (pooler-safe patches). Runs once per process. */
export async function ensureMenuItemsSchema() {
  if (ensured) return;
  try {
    const cols = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'defaultUnit'
    `;
    if (cols.length > 0) {
      ensured = true;
      return;
    }
    for (const sql of statements) {
      await prisma.$executeRawUnsafe(sql);
    }
    ensured = true;
    console.log("[db] Patched menu_items schema for smart catalog.");
  } catch (e) {
    console.warn("[db] menu_items schema patch skipped:", e);
  }
}
