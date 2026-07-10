-- Team member profile fields
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "team_members" ADD COLUMN IF NOT EXISTS "jobTitle" TEXT;

-- Audit log for staff & sensitive actions
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" TEXT NOT NULL,
    "catererId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_logs_catererId_idx" ON "audit_logs"("catererId");
CREATE INDEX IF NOT EXISTS "audit_logs_catererId_createdAt_idx" ON "audit_logs"("catererId", "createdAt");

ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_catererId_fkey";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_catererId_fkey" FOREIGN KEY ("catererId") REFERENCES "caterers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
