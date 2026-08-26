-- Better Auth 1.7: account identity is scoped by (issuer, accountId)

ALTER TABLE "account" ADD COLUMN IF NOT EXISTS "issuer" TEXT;

-- Credential (email/password) accounts
UPDATE "account"
SET "issuer" = 'local:credential'
WHERE "issuer" IS NULL AND "providerId" = 'credential';

-- OAuth / other providers without a stored issuer (synthetic namespace)
UPDATE "account"
SET "issuer" = 'local:oauth:' || "providerId"
WHERE "issuer" IS NULL AND "providerId" <> 'credential';

-- Safety: any remaining rows get a synthetic issuer so NOT NULL can apply
UPDATE "account"
SET "issuer" = 'local:legacy:' || "providerId"
WHERE "issuer" IS NULL;

ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;

DROP INDEX IF EXISTS "account_providerId_accountId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "account_issuer_accountId_key"
  ON "account"("issuer", "accountId");

CREATE INDEX IF NOT EXISTS "account_providerId_idx" ON "account"("providerId");
