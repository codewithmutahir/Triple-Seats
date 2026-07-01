-- AlterEnum
ALTER TYPE "QuoteUnit" ADD VALUE 'tiered_per_head';

-- CreateTable
CREATE TABLE "catering_packages" (
    "id" TEXT NOT NULL,
    "catererId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "minGuests" INTEGER NOT NULL DEFAULT 200,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "catering_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_price_tiers" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "minGuests" INTEGER NOT NULL,
    "maxGuests" INTEGER,
    "pricePerHead" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "package_price_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "package_included_items" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "package_included_items_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "quote_line_items" ADD COLUMN "packageId" TEXT,
ADD COLUMN "appliedTier" DOUBLE PRECISION,
ADD COLUMN "appliedTierLabel" TEXT;

-- CreateIndex
CREATE INDEX "catering_packages_catererId_idx" ON "catering_packages"("catererId");

-- CreateIndex
CREATE INDEX "package_price_tiers_packageId_idx" ON "package_price_tiers"("packageId");

-- CreateIndex
CREATE INDEX "package_included_items_packageId_idx" ON "package_included_items"("packageId");

-- CreateIndex
CREATE INDEX "quote_line_items_packageId_idx" ON "quote_line_items"("packageId");

-- AddForeignKey
ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "catering_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catering_packages" ADD CONSTRAINT "catering_packages_catererId_fkey" FOREIGN KEY ("catererId") REFERENCES "caterers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_price_tiers" ADD CONSTRAINT "package_price_tiers_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "catering_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "package_included_items" ADD CONSTRAINT "package_included_items_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "catering_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
