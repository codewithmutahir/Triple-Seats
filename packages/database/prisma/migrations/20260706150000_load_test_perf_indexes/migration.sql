-- Load test / quote builder performance indexes
CREATE INDEX IF NOT EXISTS "quotes_catererId_eventId_idx" ON "quotes"("catererId", "eventId");
CREATE INDEX IF NOT EXISTS "menu_items_catererId_usageCount_idx" ON "menu_items"("catererId", "usageCount");
