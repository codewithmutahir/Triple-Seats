-- Per-caterer public URLs: /c/{slug}/book and {slug}.{root-domain}/book
ALTER TABLE "caterers" ADD COLUMN IF NOT EXISTS "slug" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "caterers_slug_key" ON "caterers"("slug");
