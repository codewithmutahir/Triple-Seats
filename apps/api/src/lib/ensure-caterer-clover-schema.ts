import { prisma } from "@tripeseats/database";

let ensured = false;

/** Ensures caterer Clover credential columns exist (pooler-safe). */
export async function ensureCatererCloverSchema() {
  if (ensured) return;
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "caterers" ADD COLUMN IF NOT EXISTS "cloverMerchantId" TEXT`
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "caterers" ADD COLUMN IF NOT EXISTS "cloverPrivateKeyEnc" TEXT`
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "caterers" ADD COLUMN IF NOT EXISTS "cloverWebhookSecretEnc" TEXT`
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "caterers" ADD COLUMN IF NOT EXISTS "cloverPublicKey" TEXT`
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "caterers" ADD COLUMN IF NOT EXISTS "cloverConnectedAt" TIMESTAMP(3)`
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "caterers" ADD COLUMN IF NOT EXISTS "cloverRefreshTokenEnc" TEXT`
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "caterers" ADD COLUMN IF NOT EXISTS "cloverAccessTokenExpiresAt" TIMESTAMP(3)`
    );
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "caterers_cloverMerchantId_idx" ON "caterers"("cloverMerchantId")`
    );
    ensured = true;
  } catch (e) {
    console.warn("[db] caterer clover schema patch skipped:", e);
  }
}
