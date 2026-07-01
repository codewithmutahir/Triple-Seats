import { prisma } from "@tripeseats/database";

let ensured = false;

const statements = [
  `ALTER TABLE "caterers" ADD COLUMN IF NOT EXISTS "slug" TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "caterers_slug_key" ON "caterers"("slug")`
];

/** Ensures caterers.slug exists (pooler-safe). Runs once per API process. */
export async function ensureCatererSlugSchema() {
  if (ensured) return;
  try {
    const cols = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'caterers' AND column_name = 'slug'
    `;
    if (cols.length > 0) {
      ensured = true;
      return;
    }
    for (const sql of statements) {
      await prisma.$executeRawUnsafe(sql);
    }
    ensured = true;
    console.log("[db] Patched caterers.slug for tenant subdomains.");
  } catch (e) {
    console.warn("[db] caterers.slug schema patch skipped:", e);
  }
}
