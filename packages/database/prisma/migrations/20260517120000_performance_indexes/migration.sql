-- Performance indexes for dashboard / leads list queries
CREATE INDEX IF NOT EXISTS "events_catererId_idx" ON "events"("catererId");
CREATE INDEX IF NOT EXISTS "events_catererId_status_idx" ON "events"("catererId", "status");
CREATE INDEX IF NOT EXISTS "events_catererId_eventDate_idx" ON "events"("catererId", "eventDate");
CREATE INDEX IF NOT EXISTS "events_createdAt_idx" ON "events"("createdAt");

CREATE INDEX IF NOT EXISTS "leads_catererId_idx" ON "leads"("catererId");
CREATE INDEX IF NOT EXISTS "leads_contactEmail_idx" ON "leads"("contactEmail");

CREATE INDEX IF NOT EXISTS "guests_catererId_idx" ON "guests"("catererId");
CREATE INDEX IF NOT EXISTS "guests_catererId_email_idx" ON "guests"("catererId", "email");
