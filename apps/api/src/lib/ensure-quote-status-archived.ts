import { prisma } from "@tripeseats/database";

let ensured = false;

/** Ensures QuoteStatus enum includes archived (required for active-quote filters). */
export async function ensureQuoteStatusArchived() {
  if (ensured) return;
  try {
    const rows = await prisma.$queryRaw<{ enumlabel: string }[]>`
      SELECT enumlabel FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'QuoteStatus' AND e.enumlabel = 'archived'
    `;
    if (rows.length > 0) {
      ensured = true;
      return;
    }

    await prisma.$executeRawUnsafe(`ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'archived'`);
    ensured = true;
    console.log("[db] Patched QuoteStatus.archived enum value.");
  } catch (e) {
    console.warn("[db] QuoteStatus.archived patch skipped:", e);
  }
}
