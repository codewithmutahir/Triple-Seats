import { prisma } from "@tripeseats/database";

let ensured = false;

/** Ensures QuoteUnit enum includes values required by the app. Runs once per process. */
export async function ensureQuoteUnitEnum() {
  if (ensured) return;
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TYPE "QuoteUnit" ADD VALUE IF NOT EXISTS 'per_piece'`
    );
    ensured = true;
  } catch (e) {
    console.warn("[db] QuoteUnit per_piece patch skipped:", e);
  }
}
