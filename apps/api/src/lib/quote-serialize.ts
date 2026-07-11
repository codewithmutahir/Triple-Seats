import type { Prisma } from "@tripeseats/database";

import { calculateQuoteTotals } from "./quote-totals";
import { eventTypeTitle } from "./event-customer-types";
import { normalizePackageSelections } from "./package-selections";

export const quoteInclude = {
  lineItems: {
    orderBy: { createdAt: "asc" as const },
    include: {
      package: {
        include: {
          tiers: { orderBy: { minGuests: "asc" as const } },
          items: { orderBy: { sortOrder: "asc" as const } }
        }
      }
    }
  },
  event: { include: { primaryGuest: true } }
} satisfies Prisma.QuoteInclude;

/** Builder batch — no nested event (fetched in parallel on the route). */
export const quoteBuilderInclude = {
  lineItems: quoteInclude.lineItems
} satisfies Prisma.QuoteInclude;

export type QuoteWithRelations = Prisma.QuoteGetPayload<{ include: typeof quoteInclude }>;
type QuoteLineItem = QuoteWithRelations["lineItems"][number];
type QuoteStatus = QuoteWithRelations["status"];
type ItemCategory = QuoteLineItem["category"];
type QuoteUnit = QuoteLineItem["unitType"];

export function serializeLineItem(item: QuoteLineItem) {
  return {
    id: item.id,
    quoteId: item.quoteId,
    menuItemId: item.menuItemId,
    packageId: item.packageId,
    category: item.category,
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    unitType: item.unitType,
    appliedTier: item.appliedTier,
    appliedTierLabel: item.appliedTierLabel,
    notes: item.notes,
    package: item.package
      ? {
          id: item.package.id,
          name: item.package.name,
          minGuests: item.package.minGuests,
          tiers: item.package.tiers.map((t) => ({
            id: t.id,
            customerType: t.customerType,
            minGuests: t.minGuests,
            maxGuests: t.maxGuests,
            pricePerHead: t.pricePerHead
          })),
          items: item.package.items.map((i) => ({
            id: i.id,
            label: i.label,
            quantity: i.quantity,
            sortOrder: i.sortOrder
          }))
        }
      : null
  };
}

export type QuoteTotalsPatchSource = {
  id: string;
  taxRate: number;
  depositPct: number;
  totalAmount: number;
  lineItems: QuoteLineItem[];
  guestCount: number;
};

/** Slim mutation response — line items + totals only (no nested event graph). */
export function serializeQuoteTotalsPatch(quote: QuoteTotalsPatchSource) {
  const totals = calculateQuoteTotals(
    quote.lineItems,
    quote.taxRate,
    quote.depositPct,
    quote.guestCount
  );

  return {
    id: quote.id,
    totalAmount: quote.totalAmount,
    taxRate: quote.taxRate,
    depositPct: quote.depositPct,
    lineItems: quote.lineItems.map(serializeLineItem),
    totals
  };
}

export function serializeQuote(quote: QuoteWithRelations) {
  const guestCount = quote.event?.guestCountEstimate ?? 0;
  const totals = calculateQuoteTotals(
    quote.lineItems,
    quote.taxRate,
    quote.depositPct,
    guestCount
  );

  const g = quote.event?.primaryGuest;
  const guestName = g ? [g.firstName, g.lastName].filter(Boolean).join(" ") : null;

  return {
    id: quote.id,
    catererId: quote.catererId,
    eventId: quote.eventId,
    status: quote.status,
    notes: quote.notes,
    taxRate: quote.taxRate,
    depositPct: quote.depositPct,
    dueDate: quote.dueDate?.toISOString() ?? null,
    totalAmount: quote.totalAmount,
    packageSelections: normalizePackageSelections(quote.packageSelections),
    createdAt: quote.createdAt.toISOString(),
    updatedAt: quote.updatedAt.toISOString(),
    lineItems: quote.lineItems.map(serializeLineItem),
    totals,
    event: quote.event
      ? {
          id: quote.event.id,
          title: quote.event.title,
          eventType: quote.event.eventType,
          eventTypeLabel: eventTypeTitle(quote.event.eventType),
          customerType: quote.event.customerType,
          eventDate: quote.event.eventDate.toISOString(),
          startTime: quote.event.startTime?.toISOString() ?? null,
          endTime: quote.event.endTime?.toISOString() ?? null,
          guestCountEstimate: quote.event.guestCountEstimate,
          venueAddress: quote.event.venueAddress,
          venueName: quote.event.venueName,
          guestName,
          primaryGuest: g
            ? {
                id: g.id,
                firstName: g.firstName,
                lastName: g.lastName,
                email: g.email,
                phone: g.phone
              }
            : null
        }
      : undefined
  };
}

export function parseQuoteStatus(value: unknown): QuoteStatus | null {
  if (
    value === "draft" ||
    value === "sending" ||
    value === "send_failed" ||
    value === "sent" ||
    value === "accepted" ||
    value === "declined" ||
    value === "archived"
  ) {
    return value;
  }
  return null;
}

export function parseItemCategory(value: unknown): ItemCategory | null {
  const allowed = [
    "appetizer",
    "veg_gravy",
    "chicken_gravy",
    "mutton_gravy",
    "rice_chicken",
    "rice_mutton",
    "breads",
    "side_items",
    "bbq",
    "dessert",
    "beverages",
    "equipment",
    "delivery",
    "labor",
    "other"
  ] as const;
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
    return value as ItemCategory;
  }
  return null;
}

export function parseQuoteUnit(value: unknown): QuoteUnit | null {
  if (
    value === "per_head" ||
    value === "by_tray" ||
    value === "flat" ||
    value === "per_piece" ||
    value === "tiered_per_head"
  ) {
    return value;
  }
  return null;
}
