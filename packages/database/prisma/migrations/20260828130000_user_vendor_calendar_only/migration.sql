-- External vendor: restrict existing accounts to vendor calendar only after invite accept

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "vendorCalendarOnly" BOOLEAN NOT NULL DEFAULT false;
