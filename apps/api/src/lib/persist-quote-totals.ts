import type { Prisma } from "@tripeseats/database";
import { prisma } from "@tripeseats/database";

import { calculateQuoteTotals, formatTierLabel, getActiveTier } from "./quote-totals";

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
  const customerType = quote.event?.customerType ?? "b2c";

  const tieredNeedingPackage = quote.lineItems.filter(
    (item) => item.unitType === "tiered_per_head" && item.appliedTier == null && item.packageId
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

  if (tieredNeedingPackage.length > 0) {
    const packageIds = [
      ...new Set(tieredNeedingPackage.map((item) => item.packageId).filter(Boolean))
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
    if (item.unitType !== "tiered_per_head" || item.appliedTier != null || !item.packageId) {
      return item;
    }

    const pkg = packageMap.get(item.packageId);
    if (!pkg) return item;

    const activeTier = getActiveTier(pkg.tiers, guestCount, customerType);
    if (!activeTier) return item;

    lineItemUpdates.push(
      prisma.quoteLineItem.update({
        where: { id: item.id },
        data: {
          unitPrice: activeTier.pricePerHead,
          notes: formatTierLabel(activeTier)
        }
      })
    );

    return { ...item, unitPrice: activeTier.pricePerHead };
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
          guestCountEstimate: true
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
