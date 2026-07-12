import { prisma } from "@tripeseats/database";

let ensured = false;

/** Ensures payments table, enums, and QuoteStatus.archived exist (pooler-safe patch). */
export async function ensurePaymentsSchema() {
  if (ensured) return;
  try {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'payments'
    `;
    if (tables.length > 0) {
      ensured = true;
      return;
    }

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'archived';
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'credit_card', 'bank_transfer', 'other');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'completed', 'refunded');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "payments" (
        "id" TEXT NOT NULL,
        "catererId" TEXT NOT NULL,
        "eventId" TEXT NOT NULL,
        "quoteId" TEXT,
        "amount" DOUBLE PRECISION NOT NULL,
        "method" "PaymentMethod" NOT NULL,
        "status" "PaymentStatus" NOT NULL DEFAULT 'completed',
        "note" TEXT,
        "addedBy" TEXT NOT NULL,
        "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
      )
    `);

    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "payments_catererId_idx" ON "payments"("catererId")`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "payments_eventId_idx" ON "payments"("eventId")`
    );

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'payments_catererId_fkey'
        ) THEN
          ALTER TABLE "payments" ADD CONSTRAINT "payments_catererId_fkey"
            FOREIGN KEY ("catererId") REFERENCES "caterers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'payments_eventId_fkey'
        ) THEN
          ALTER TABLE "payments" ADD CONSTRAINT "payments_eventId_fkey"
            FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'payments_quoteId_fkey'
        ) THEN
          ALTER TABLE "payments" ADD CONSTRAINT "payments_quoteId_fkey"
            FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
      END $$
    `);

    ensured = true;
    console.log("[db] Patched payments schema.");
  } catch (e) {
    console.warn("[db] payments schema patch skipped:", e);
  }
}
