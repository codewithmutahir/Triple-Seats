import { prisma } from "@tripeseats/database";

let ensured = false;

/** Ensures quote_item_idempotency table (pooler-safe). Runs once per process. */
export async function ensureQuoteItemIdempotencySchema() {
  if (ensured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "quote_item_idempotency" (
        "id" TEXT NOT NULL,
        "quoteId" TEXT NOT NULL,
        "clientRequestId" TEXT NOT NULL,
        "lineItemId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "quote_item_idempotency_pkey" PRIMARY KEY ("id")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "quote_item_idempotency_quoteId_clientRequestId_key"
      ON "quote_item_idempotency"("quoteId", "clientRequestId")
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "quote_item_idempotency_quoteId_idx"
      ON "quote_item_idempotency"("quoteId")
    `);

    ensured = true;
  } catch (e) {
    console.warn("[db] quote_item_idempotency schema patch skipped:", e);
  }
}
