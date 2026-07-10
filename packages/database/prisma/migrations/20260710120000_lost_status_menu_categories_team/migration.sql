-- EventStatus: add lost
ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'lost';

-- ItemCategory: add new values
ALTER TYPE "ItemCategory" ADD VALUE IF NOT EXISTS 'veg_gravy';
ALTER TYPE "ItemCategory" ADD VALUE IF NOT EXISTS 'chicken_gravy';
ALTER TYPE "ItemCategory" ADD VALUE IF NOT EXISTS 'mutton_gravy';
ALTER TYPE "ItemCategory" ADD VALUE IF NOT EXISTS 'rice_chicken';
ALTER TYPE "ItemCategory" ADD VALUE IF NOT EXISTS 'rice_mutton';
ALTER TYPE "ItemCategory" ADD VALUE IF NOT EXISTS 'breads';
ALTER TYPE "ItemCategory" ADD VALUE IF NOT EXISTS 'side_items';
ALTER TYPE "ItemCategory" ADD VALUE IF NOT EXISTS 'beverages';

-- Migrate legacy main_course rows to veg_gravy
UPDATE "menu_items" SET "category" = 'veg_gravy' WHERE "category" = 'main_course';
UPDATE "quote_line_items" SET "category" = 'veg_gravy' WHERE "category" = 'main_course';

-- Team roles & invites
CREATE TYPE "TeamRole" AS ENUM ('owner', 'admin', 'manager', 'sales', 'ops', 'viewer');
CREATE TYPE "InviteStatus" AS ENUM ('pending', 'accepted', 'declined', 'expired');

CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "catererId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'viewer',
    "inviteToken" TEXT,
    "inviteStatus" "InviteStatus" NOT NULL DEFAULT 'pending',
    "invitedBy" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "team_members_inviteToken_key" ON "team_members"("inviteToken");
CREATE INDEX "team_members_catererId_idx" ON "team_members"("catererId");
CREATE INDEX "team_members_inviteToken_idx" ON "team_members"("inviteToken");
CREATE UNIQUE INDEX "team_members_catererId_email_key" ON "team_members"("catererId", "email");

ALTER TABLE "team_members" ADD CONSTRAINT "team_members_catererId_fkey" FOREIGN KEY ("catererId") REFERENCES "caterers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
