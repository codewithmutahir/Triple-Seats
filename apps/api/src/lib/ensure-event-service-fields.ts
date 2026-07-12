import { prisma } from "@tripeseats/database";

let ensured = false;

/** Ensures events.serviceType / orderMode (+ enums) exist (pooler-safe patch). Runs once per process. */
export async function ensureEventServiceFieldsSchema() {
  if (ensured) return;
  try {
    const cols = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'serviceType'
    `;
    if (cols.length > 0) {
      ensured = true;
      return;
    }

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "ServiceType" AS ENUM ('full_service', 'order_by_tray');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        CREATE TYPE "OrderMode" AS ENUM ('delivery', 'pickup');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await prisma.$executeRawUnsafe(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "serviceType" "ServiceType" NOT NULL DEFAULT 'full_service'`
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "orderMode" "OrderMode" NOT NULL DEFAULT 'delivery'`
    );

    await prisma.$executeRawUnsafe(
      `UPDATE "events" SET "serviceType" = 'full_service', "orderMode" = 'delivery' WHERE "eventType" = 'full_service'`
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "events" SET "serviceType" = 'order_by_tray', "orderMode" = 'pickup' WHERE "eventType" = 'pickup'`
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "events" SET "serviceType" = 'order_by_tray', "orderMode" = 'delivery' WHERE "eventType" IN ('order_by_tray', 'delivery')`
    );

    ensured = true;
    console.log("[db] Patched events.serviceType / orderMode schema.");
  } catch (e) {
    console.warn("[db] event service fields schema patch skipped:", e);
  }
}
