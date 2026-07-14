import { prisma } from "@tripeseats/database";

let ensured = false;

/** Ensures quotes.revision exists (pooler-safe). Runs once per process. */
export async function ensureQuoteRevisionSchema() {
  if (ensured) return;
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 0`
    );
    ensured = true;
  } catch (e) {
    console.warn("[db] quote revision schema patch skipped:", e);
  }
}
