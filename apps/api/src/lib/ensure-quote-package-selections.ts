import { prisma } from "@tripeseats/database";

let ensured = false;

/** Ensures quotes.packageSelections exists (pooler-safe patch). Runs once per process. */
export async function ensureQuotePackageSelectionsSchema() {
  if (ensured) return;
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "packageSelections" JSONB`
    );
    ensured = true;
  } catch (e) {
    console.warn("[db] quote packageSelections schema patch skipped:", e);
  }
}
