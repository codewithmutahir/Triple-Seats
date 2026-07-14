CREATE TABLE IF NOT EXISTS "package_kitchen_qtys" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "guestBand" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "package_kitchen_qtys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "package_kitchen_qtys_packageId_guestBand_category_key"
ON "package_kitchen_qtys"("packageId", "guestBand", "category");

CREATE INDEX IF NOT EXISTS "package_kitchen_qtys_packageId_idx"
ON "package_kitchen_qtys"("packageId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'package_kitchen_qtys_packageId_fkey'
  ) THEN
    ALTER TABLE "package_kitchen_qtys"
      ADD CONSTRAINT "package_kitchen_qtys_packageId_fkey"
      FOREIGN KEY ("packageId") REFERENCES "catering_packages"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
