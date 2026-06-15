-- Denormalized inquiry email so intake rows can be claimed when guest rows are missing (orphan leads).
ALTER TABLE "leads" ADD COLUMN "contactEmail" TEXT;

CREATE INDEX "leads_catererId_contactEmail_idx" ON "leads"("catererId", "contactEmail");
