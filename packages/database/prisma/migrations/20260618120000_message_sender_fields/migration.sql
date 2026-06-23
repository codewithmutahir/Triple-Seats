-- AlterTable
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "senderName" TEXT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "senderEmail" TEXT;

-- AlterTable: set default for channel
ALTER TABLE "messages" ALTER COLUMN "channel" SET DEFAULT 'email';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "messages_catererId_idx" ON "messages"("catererId");
