-- Per-caterer Clover Hosted Checkout credentials
ALTER TABLE "caterers" ADD COLUMN IF NOT EXISTS "cloverMerchantId" TEXT;
ALTER TABLE "caterers" ADD COLUMN IF NOT EXISTS "cloverPrivateKeyEnc" TEXT;
ALTER TABLE "caterers" ADD COLUMN IF NOT EXISTS "cloverWebhookSecretEnc" TEXT;
ALTER TABLE "caterers" ADD COLUMN IF NOT EXISTS "cloverPublicKey" TEXT;
ALTER TABLE "caterers" ADD COLUMN IF NOT EXISTS "cloverConnectedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "caterers_cloverMerchantId_idx" ON "caterers"("cloverMerchantId");
