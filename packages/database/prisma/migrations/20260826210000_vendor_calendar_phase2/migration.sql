-- Vendor Calendar Phase 2: recurrence + reminders (idempotent)

DO $$ BEGIN
  CREATE TYPE "VendorRecurrenceFreq" AS ENUM ('none', 'daily', 'weekly', 'monthly', 'yearly');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "vendor_calendar_entries"
  ADD COLUMN IF NOT EXISTS "recurrenceFreq" "VendorRecurrenceFreq" NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "recurrenceInterval" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "recurrenceDaysOfWeek" TEXT,
  ADD COLUMN IF NOT EXISTS "recurrenceEndAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "recurrenceCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "reminderMinutesBefore" INTEGER;

CREATE INDEX IF NOT EXISTS "vendor_calendar_entries_ownerUserId_recurrenceFreq_idx"
  ON "vendor_calendar_entries"("ownerUserId", "recurrenceFreq");
