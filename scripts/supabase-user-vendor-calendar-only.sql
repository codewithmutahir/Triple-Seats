-- Restrict existing dashboard users to vendor-calendar-only after accepting external invite.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "vendorCalendarOnly" BOOLEAN NOT NULL DEFAULT false;
