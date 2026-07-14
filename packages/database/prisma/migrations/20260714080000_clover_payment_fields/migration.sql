-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'failed';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "provider" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "checkoutSessionId" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "externalPaymentId" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "checkoutUrl" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "payments_checkoutSessionId_key" ON "payments"("checkoutSessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "payments_idempotencyKey_key" ON "payments"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "payments_externalPaymentId_idx" ON "payments"("externalPaymentId");
