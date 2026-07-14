CREATE TABLE IF NOT EXISTS "quote_item_idempotency" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quote_item_idempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "quote_item_idempotency_quoteId_clientRequestId_key"
ON "quote_item_idempotency"("quoteId", "clientRequestId");

CREATE INDEX IF NOT EXISTS "quote_item_idempotency_quoteId_idx"
ON "quote_item_idempotency"("quoteId");


