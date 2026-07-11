import { prisma } from "@tripeseats/database";

import { quoteInclude, type QuoteWithRelations } from "./quote-serialize";

const ACTIVE_QUOTE_FILTER = {
  status: { not: "archived" as const }
};

export async function getLatestActiveQuote(
  eventId: string,
  catererId: string
): Promise<QuoteWithRelations | null> {
  return prisma.quote.findFirst({
    where: { eventId, catererId, ...ACTIVE_QUOTE_FILTER },
    orderBy: { createdAt: "desc" },
    include: quoteInclude
  }) as Promise<QuoteWithRelations | null>;
}

export async function archiveQuote(quoteId: string, catererId: string): Promise<boolean> {
  const result = await prisma.quote.updateMany({
    where: { id: quoteId, catererId, status: { not: "archived" } },
    data: { status: "archived" }
  });
  return result.count > 0;
}
