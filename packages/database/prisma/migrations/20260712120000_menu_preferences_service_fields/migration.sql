-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('full_service', 'order_by_tray');

-- CreateEnum
CREATE TYPE "OrderMode" AS ENUM ('delivery', 'pickup');

-- AlterTable
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "serviceType" "ServiceType" NOT NULL DEFAULT 'full_service';
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "orderMode" "OrderMode" NOT NULL DEFAULT 'delivery';

-- CreateTable
CREATE TABLE IF NOT EXISTS "menu_preferences" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "slotLabel" TEXT NOT NULL,
    "selectedItem" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "menu_preferences_eventId_slotLabel_key" ON "menu_preferences"("eventId", "slotLabel");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "menu_preferences_eventId_idx" ON "menu_preferences"("eventId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_preferences_eventId_fkey'
  ) THEN
    ALTER TABLE "menu_preferences" ADD CONSTRAINT "menu_preferences_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill serviceType / orderMode from legacy eventType
UPDATE "events" SET "serviceType" = 'full_service', "orderMode" = 'delivery' WHERE "eventType" = 'full_service';
UPDATE "events" SET "serviceType" = 'order_by_tray', "orderMode" = 'pickup' WHERE "eventType" = 'pickup';
UPDATE "events" SET "serviceType" = 'order_by_tray', "orderMode" = 'delivery' WHERE "eventType" IN ('order_by_tray', 'delivery');
