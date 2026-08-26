-- Vendor Calendar Phase 3: meeting links, custom color, attendees, reminder log, iCal token

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "vendorCalendarIcalToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "user_vendorCalendarIcalToken_key"
  ON "user"("vendorCalendarIcalToken");

ALTER TABLE "vendor_calendar_entries"
  ADD COLUMN IF NOT EXISTS "meetingUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "colorHex" TEXT;

CREATE TABLE IF NOT EXISTS "vendor_calendar_attendees" (
  "id" TEXT NOT NULL,
  "catererId" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vendor_calendar_attendees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "vendor_calendar_attendees_entryId_email_key"
  ON "vendor_calendar_attendees"("entryId", "email");

CREATE INDEX IF NOT EXISTS "vendor_calendar_attendees_catererId_idx"
  ON "vendor_calendar_attendees"("catererId");

CREATE INDEX IF NOT EXISTS "vendor_calendar_attendees_entryId_idx"
  ON "vendor_calendar_attendees"("entryId");

DO $$ BEGIN
  ALTER TABLE "vendor_calendar_attendees"
    ADD CONSTRAINT "vendor_calendar_attendees_catererId_fkey"
    FOREIGN KEY ("catererId") REFERENCES "caterers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "vendor_calendar_attendees"
    ADD CONSTRAINT "vendor_calendar_attendees_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "vendor_calendar_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "vendor_calendar_reminder_logs" (
  "id" TEXT NOT NULL,
  "catererId" TEXT NOT NULL,
  "entryId" TEXT NOT NULL,
  "occurrenceStartAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vendor_calendar_reminder_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "vendor_calendar_reminder_logs_entryId_occurrenceStartAt_key"
  ON "vendor_calendar_reminder_logs"("entryId", "occurrenceStartAt");

CREATE INDEX IF NOT EXISTS "vendor_calendar_reminder_logs_catererId_idx"
  ON "vendor_calendar_reminder_logs"("catererId");

CREATE INDEX IF NOT EXISTS "vendor_calendar_reminder_logs_entryId_idx"
  ON "vendor_calendar_reminder_logs"("entryId");

DO $$ BEGIN
  ALTER TABLE "vendor_calendar_reminder_logs"
    ADD CONSTRAINT "vendor_calendar_reminder_logs_catererId_fkey"
    FOREIGN KEY ("catererId") REFERENCES "caterers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "vendor_calendar_reminder_logs"
    ADD CONSTRAINT "vendor_calendar_reminder_logs_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "vendor_calendar_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
