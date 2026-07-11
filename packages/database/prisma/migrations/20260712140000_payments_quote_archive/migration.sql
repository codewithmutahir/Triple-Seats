-- AlterEnum
ALTER TYPE "QuoteStatus" ADD VALUE 'archived';

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'credit_card', 'bank_transfer', 'other');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'completed', 'refunded');

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "catererId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "quoteId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'completed',
    "note" TEXT,
    "addedBy" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_catererId_idx" ON "payments"("catererId");

-- CreateIndex
CREATE INDEX "payments_eventId_idx" ON "payments"("eventId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_catererId_fkey" FOREIGN KEY ("catererId") REFERENCES "caterers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
