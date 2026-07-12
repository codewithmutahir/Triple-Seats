import { prisma } from "@tripeseats/database";

let ensured = false;

/** Ensures menu_preferences table + labor ItemCategory enum (pooler-safe). Runs once per process. */
export async function ensureMenuPreferencesSchema() {
  if (ensured) return;
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TYPE "ItemCategory" ADD VALUE IF NOT EXISTS 'labor'`
    );

    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'menu_preferences'
    `;
    if (tables.length > 0) {
      ensured = true;
      return;
    }

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "menu_preferences" (
        "id" TEXT NOT NULL,
        "eventId" TEXT NOT NULL,
        "packageId" TEXT NOT NULL,
        "slotLabel" TEXT NOT NULL,
        "selectedItem" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "menu_preferences_pkey" PRIMARY KEY ("id")
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "menu_preferences_eventId_slotLabel_key"
      ON "menu_preferences"("eventId", "slotLabel")
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "menu_preferences_eventId_idx"
      ON "menu_preferences"("eventId")
    `);

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'menu_preferences_eventId_fkey'
        ) THEN
          ALTER TABLE "menu_preferences" ADD CONSTRAINT "menu_preferences_eventId_fkey"
            FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);

    ensured = true;
    console.log("[db] Patched menu_preferences schema.");
  } catch (e) {
    console.warn("[db] menu_preferences schema patch skipped:", e);
  }
}
