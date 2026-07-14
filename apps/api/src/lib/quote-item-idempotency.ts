import { randomUUID } from "node:crypto";

import { prisma } from "@tripeseats/database";
import type { Request } from "express";

export function parseQuoteItemIdempotencyKey(
  req: Request,
  body?: { clientRequestId?: string }
): string | null {
  const header = req.headers["idempotency-key"];
  const fromHeader =
    typeof header === "string"
      ? header.trim()
      : Array.isArray(header)
        ? (header[0]?.trim() ?? "")
        : "";
  const fromBody = typeof body?.clientRequestId === "string" ? body.clientRequestId.trim() : "";
  const key = fromHeader || fromBody;
  return key || null;
}

export async function findIdempotentLineItemId(
  quoteId: string,
  clientRequestId: string
): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ lineItemId: string }[]>`
    SELECT "lineItemId"
    FROM "quote_item_idempotency"
    WHERE "quoteId" = ${quoteId} AND "clientRequestId" = ${clientRequestId}
    LIMIT 1
  `;
  return rows[0]?.lineItemId ?? null;
}

export async function recordIdempotentLineItem(
  quoteId: string,
  clientRequestId: string,
  lineItemId: string
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "quote_item_idempotency" ("id", "quoteId", "clientRequestId", "lineItemId", "createdAt")
    VALUES (${randomUUID()}, ${quoteId}, ${clientRequestId}, ${lineItemId}, NOW())
    ON CONFLICT ("quoteId", "clientRequestId") DO NOTHING
  `;
}
