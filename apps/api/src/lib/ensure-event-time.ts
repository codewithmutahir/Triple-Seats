import { prisma } from "@tripeseats/database";

let ensured = false;

/** Ensures events.eventTime exists (pooler-safe patch). Runs once per process. */
export async function ensureEventTimeSchema() {
  if (ensured) return;
  try {
    const cols = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'eventTime'
    `;
    if (cols.length > 0) {
      ensured = true;
      return;
    }

    await prisma.$executeRawUnsafe(`ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "eventTime" TEXT`);
    ensured = true;
    console.log("[db] Patched events.eventTime schema.");
  } catch (e) {
    console.warn("[db] eventTime schema patch skipped:", e);
  }
}
