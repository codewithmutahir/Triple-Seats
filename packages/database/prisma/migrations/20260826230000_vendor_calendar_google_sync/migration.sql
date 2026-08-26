-- Vendor Calendar: Google Calendar OAuth two-way sync

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "googleCalendarRefreshTokenEnc" TEXT,
  ADD COLUMN IF NOT EXISTS "googleCalendarAccessTokenEnc" TEXT,
  ADD COLUMN IF NOT EXISTS "googleCalendarTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "googleCalendarId" TEXT DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS "googleCalendarEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "googleCalendarConnectedAt" TIMESTAMP(3);

ALTER TABLE "vendor_calendar_entries"
  ADD COLUMN IF NOT EXISTS "googleEventId" TEXT,
  ADD COLUMN IF NOT EXISTS "googleEventEtag" TEXT,
  ADD COLUMN IF NOT EXISTS "googleEventUpdatedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "vendor_calendar_entries_ownerUserId_googleEventId_idx"
  ON "vendor_calendar_entries"("ownerUserId", "googleEventId");
