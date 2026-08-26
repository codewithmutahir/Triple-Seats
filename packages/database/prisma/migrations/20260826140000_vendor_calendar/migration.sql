-- CreateEnum
CREATE TYPE "CalendarShowAs" AS ENUM ('busy', 'free', 'tentative', 'oof');

-- CreateEnum
CREATE TYPE "CalendarShareScope" AS ENUM ('view', 'edit');

-- AlterTable
ALTER TABLE "user" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "vendor_calendar_entries" (
    "id" TEXT NOT NULL,
    "catererId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "location" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "showAs" "CalendarShowAs" NOT NULL DEFAULT 'busy',
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_calendar_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_share_grants" (
    "id" TEXT NOT NULL,
    "granteeUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "scope" "CalendarShareScope" NOT NULL DEFAULT 'view',
    "grantedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_share_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_calendar_entries_catererId_idx" ON "vendor_calendar_entries"("catererId");

-- CreateIndex
CREATE INDEX "vendor_calendar_entries_catererId_startAt_endAt_idx" ON "vendor_calendar_entries"("catererId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "vendor_calendar_entries_ownerUserId_startAt_idx" ON "vendor_calendar_entries"("ownerUserId", "startAt");

-- CreateIndex
CREATE INDEX "calendar_share_grants_granteeUserId_idx" ON "calendar_share_grants"("granteeUserId");

-- CreateIndex
CREATE INDEX "calendar_share_grants_targetUserId_idx" ON "calendar_share_grants"("targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_share_grants_granteeUserId_targetUserId_key" ON "calendar_share_grants"("granteeUserId", "targetUserId");

-- AddForeignKey
ALTER TABLE "vendor_calendar_entries" ADD CONSTRAINT "vendor_calendar_entries_catererId_fkey" FOREIGN KEY ("catererId") REFERENCES "caterers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_calendar_entries" ADD CONSTRAINT "vendor_calendar_entries_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_share_grants" ADD CONSTRAINT "calendar_share_grants_granteeUserId_fkey" FOREIGN KEY ("granteeUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_share_grants" ADD CONSTRAINT "calendar_share_grants_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_share_grants" ADD CONSTRAINT "calendar_share_grants_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
