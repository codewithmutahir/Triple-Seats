/*
  Warnings:

  - You are about to drop the `Profile` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('lead', 'discussion', 'booked', 'completed');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('per_head', 'by_tray');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound', 'internal');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('todo', 'in_progress', 'blocked', 'done');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('pending', 'sent', 'acknowledged', 'paid');

-- DropTable
DROP TABLE "Profile";

-- CreateTable
CREATE TABLE "caterers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "timezone" TEXT DEFAULT 'UTC',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "websiteUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "caterers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guests" (
    "id" TEXT NOT NULL,
    "catererId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "company" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "catererId" TEXT NOT NULL,
    "guestId" TEXT,
    "source" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "estimatedBudget" DECIMAL(12,2),
    "estimatedGuests" INTEGER,
    "expectedEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "catererId" TEXT NOT NULL,
    "leadId" TEXT,
    "primaryGuestId" TEXT,
    "title" TEXT NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'lead',
    "eventDate" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "venueName" TEXT,
    "venueAddress" TEXT,
    "guestCountEstimate" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "catererId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "validUntil" TIMESTAMP(3),
    "subtotal" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_line_items" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "menuItemId" TEXT,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "quantity" DECIMAL(12,2) NOT NULL,
    "unitType" "UnitType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "catererId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultPrice" DECIMAL(12,2) NOT NULL,
    "defaultUnitType" "UnitType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "catererId" TEXT NOT NULL,
    "eventId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'todo',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "catererId" TEXT NOT NULL,
    "leadId" TEXT,
    "eventId" TEXT,
    "guestId" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_reminders" (
    "id" TEXT NOT NULL,
    "catererId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "quoteId" TEXT,
    "status" "ReminderStatus" NOT NULL DEFAULT 'pending',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amountDue" DECIMAL(12,2) NOT NULL,
    "reminderDate" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "caterers_email_key" ON "caterers"("email");

-- CreateIndex
CREATE INDEX "guests_catererId_createdAt_idx" ON "guests"("catererId", "createdAt");

-- CreateIndex
CREATE INDEX "guests_catererId_phone_idx" ON "guests"("catererId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "guests_catererId_email_key" ON "guests"("catererId", "email");

-- CreateIndex
CREATE INDEX "leads_catererId_createdAt_idx" ON "leads"("catererId", "createdAt");

-- CreateIndex
CREATE INDEX "leads_catererId_expectedEventAt_idx" ON "leads"("catererId", "expectedEventAt");

-- CreateIndex
CREATE INDEX "leads_guestId_idx" ON "leads"("guestId");

-- CreateIndex
CREATE INDEX "events_catererId_status_eventDate_idx" ON "events"("catererId", "status", "eventDate");

-- CreateIndex
CREATE INDEX "events_leadId_idx" ON "events"("leadId");

-- CreateIndex
CREATE INDEX "events_primaryGuestId_idx" ON "events"("primaryGuestId");

-- CreateIndex
CREATE INDEX "quotes_eventId_createdAt_idx" ON "quotes"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "quotes_catererId_createdAt_idx" ON "quotes"("catererId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_catererId_quoteNumber_version_key" ON "quotes"("catererId", "quoteNumber", "version");

-- CreateIndex
CREATE INDEX "quote_line_items_quoteId_category_idx" ON "quote_line_items"("quoteId", "category");

-- CreateIndex
CREATE INDEX "quote_line_items_menuItemId_idx" ON "quote_line_items"("menuItemId");

-- CreateIndex
CREATE INDEX "menu_items_catererId_category_isActive_idx" ON "menu_items"("catererId", "category", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_catererId_name_key" ON "menu_items"("catererId", "name");

-- CreateIndex
CREATE INDEX "tasks_catererId_status_dueAt_idx" ON "tasks"("catererId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "tasks_eventId_idx" ON "tasks"("eventId");

-- CreateIndex
CREATE INDEX "messages_catererId_createdAt_idx" ON "messages"("catererId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_leadId_idx" ON "messages"("leadId");

-- CreateIndex
CREATE INDEX "messages_eventId_idx" ON "messages"("eventId");

-- CreateIndex
CREATE INDEX "messages_guestId_idx" ON "messages"("guestId");

-- CreateIndex
CREATE INDEX "payment_reminders_catererId_dueDate_status_idx" ON "payment_reminders"("catererId", "dueDate", "status");

-- CreateIndex
CREATE INDEX "payment_reminders_eventId_idx" ON "payment_reminders"("eventId");

-- CreateIndex
CREATE INDEX "payment_reminders_quoteId_idx" ON "payment_reminders"("quoteId");

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_catererId_fkey" FOREIGN KEY ("catererId") REFERENCES "caterers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_catererId_fkey" FOREIGN KEY ("catererId") REFERENCES "caterers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_catererId_fkey" FOREIGN KEY ("catererId") REFERENCES "caterers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_primaryGuestId_fkey" FOREIGN KEY ("primaryGuestId") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_catererId_fkey" FOREIGN KEY ("catererId") REFERENCES "caterers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_catererId_fkey" FOREIGN KEY ("catererId") REFERENCES "caterers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_catererId_fkey" FOREIGN KEY ("catererId") REFERENCES "caterers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_catererId_fkey" FOREIGN KEY ("catererId") REFERENCES "caterers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_catererId_fkey" FOREIGN KEY ("catererId") REFERENCES "caterers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reminders" ADD CONSTRAINT "payment_reminders_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
