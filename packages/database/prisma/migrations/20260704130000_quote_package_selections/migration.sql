-- Persist per-slot menu picks for package-included categories (e.g. Appetizer choices).
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "packageSelections" JSONB;
