import type { Prisma } from "@tripeseats/database";
import { prisma } from "@tripeseats/database";

import { calculateQuoteTotals, formatTierLabel, getActiveTier } from "./quote-totals";

/**
 * Recalculate quote totals and rematch package line items to the tier
 * that fits the current guest count + customer type.
 *
 * Previously only filled appliedTier when null — so a locked $0 / wrong-band
 * tier stayed forever after guest count changed (e.g. 200–250 @ $0 with 500 guests).
 */
export async function persistQuoteTotals(quoteId: string) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: {
      id: true,
      catererId: true,
      taxRate: true,
      depositPct: true,
      lineItems: {
        select: {
          id: true,
          unitType: true,
          appliedTier: true,
          appliedTierLabel: true,
          packageId: true,
          unitPrice: true,
          quantity: true,
          category: true
        }
      },
      event: {
        select: {
          guestCountEstimate: true,
          customerType: true
        }
      }
    }
  });
  if (!quote) return null;

  const guestCount = quote.event?.guestCountEstimate ?? 0;
  const customerType = (quote.event?.customerType ?? "b2c") as "b2b" | "b2c";

  const packageLines = quote.lineItems.filter(
    (item) => item.unitType === "tiered_per_head" && item.packageId
  );

  const packageMap = new Map<
    string,
    Awaited<
      ReturnType<
        typeof prisma.cateringPackage.findMany<{
          include: { tiers: { orderBy: { minGuests: "asc" } } };
        }>
      >
    >[number]
  >();

  if (packageLines.length > 0) {
    const packageIds = [
      ...new Set(packageLines.map((item) => item.packageId).filter(Boolean))
    ] as string[];

    const packages = await prisma.cateringPackage.findMany({
      where: { id: { in: packageIds }, catererId: quote.catererId },
      include: { tiers: { orderBy: { minGuests: "asc" } } }
    });

    for (const pkg of packages) {
      packageMap.set(pkg.id, pkg);
    }
  }

  const lineItemUpdates: Prisma.PrismaPromise<unknown>[] = [];
  const lineItemsForTotals = quote.lineItems.map((item) => {
    if (item.unitType !== "tiered_per_head" || !item.packageId) {
      return item;
    }

    const pkg = packageMap.get(item.packageId);
    if (!pkg) return item;

    const activeTier = getActiveTier(pkg.tiers, guestCount, customerType);
    if (!activeTier) return item;

    const price = activeTier.pricePerHead;
    const label = formatTierLabel(activeTier);
    const needsUpdate =
      item.unitPrice !== price ||
      item.appliedTier !== price ||
      item.appliedTierLabel !== label;

    if (needsUpdate) {
      lineItemUpdates.push(
        prisma.quoteLineItem.update({
          where: { id: item.id },
          data: {
            unitPrice: price,
            appliedTier: price,
            appliedTierLabel: label,
            notes: label
          }
        })
      );
    }

    return {
      ...item,
      unitPrice: price,
      appliedTier: price
    };
  });

  const { grandTotal } = calculateQuoteTotals(
    lineItemsForTotals,
    quote.taxRate,
    quote.depositPct,
    guestCount
  );

  await prisma.$transaction([
    ...lineItemUpdates,
    prisma.quote.update({
      where: { id: quoteId },
      data: { totalAmount: grandTotal }
    })
  ]);

  const refreshed = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: {
      id: true,
      revision: true,
      taxRate: true,
      depositPct: true,
      totalAmount: true,
      lineItems: {
        orderBy: { createdAt: "asc" },
        include: {
          package: {
            include: {
              tiers: { orderBy: { minGuests: "asc" } },
              items: { orderBy: { sortOrder: "asc" } }
            }
          }
        }
      },
      event: {
        select: {
          guestCountEstimate: true,
          customerType: true
        }
      }
    }
  });

  if (!refreshed) return null;

  return {
    ...refreshed,
    guestCount: refreshed.event?.guestCountEstimate ?? 0
  };
}
