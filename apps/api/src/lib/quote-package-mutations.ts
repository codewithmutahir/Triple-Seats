import type { Prisma } from "@tripeseats/database";
import { prisma } from "@tripeseats/database";

import { calculateQuoteTotals, formatTierLabel, getActiveTier, tiersForCustomerType } from "./quote-totals";
import { quoteInclude } from "./quote-serialize";
import {
  clearMenuPreferencesForEvent,
  syncMenuPreferencesForPackage
} from "./menu-preferences";
import { persistQuoteTotals } from "./persist-quote-totals";

export async function loadQuoteForCaterer(quoteId: string, catererId: string) {
  return prisma.quote.findFirst({
    where: { id: quoteId, catererId },
    include: quoteInclude
  });
}

export async function addPackageToQuote(
  quoteId: string,
  catererId: string,
  packageId: string,
  tierId?: string | null,
  options?: { deferTotals?: boolean }
) {
  const created = await prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findFirst({
      where: { id: quoteId, catererId },
      include: {
        lineItems: true,
        event: { select: { id: true, guestCountEstimate: true, customerType: true } }
      }
    });
    if (!quote) {
      throw Object.assign(new Error("Quote not found."), { status: 404 });
    }

    const pkg = await tx.cateringPackage.findFirst({
      where: { id: packageId, catererId },
      include: {
        tiers: { orderBy: { minGuests: "asc" } },
        items: { orderBy: { sortOrder: "asc" } }
      }
    });
    if (!pkg) {
      throw Object.assign(new Error("Package not found."), { status: 404 });
    }

    const guestCount = quote.event?.guestCountEstimate ?? 0;
    const customerType = quote.event?.customerType ?? "b2c";
    const pool = tiersForCustomerType(pkg.tiers, customerType as "b2b" | "b2c");
    const activeTier =
      (tierId ? pkg.tiers.find((tier) => tier.id === tierId) : null) ??
      getActiveTier(pool, guestCount, customerType as "b2b" | "b2c") ??
      pool[0] ??
      null;
    if (!activeTier) {
      throw Object.assign(new Error("No pricing tier available for this package."), { status: 400 });
    }

    await tx.quoteLineItem.deleteMany({
      where: { quoteId, unitType: "tiered_per_head" }
    });

    const lineItem = await tx.quoteLineItem.create({
      data: {
        quoteId,
        packageId: pkg.id,
        category: "other",
        name: pkg.name,
        quantity: 1,
        unitPrice: activeTier.pricePerHead,
        unitType: "tiered_per_head",
        appliedTier: activeTier.pricePerHead,
        appliedTierLabel: formatTierLabel(activeTier),
        notes: formatTierLabel(activeTier)
      }
    });

    return { lineItem, eventId: quote.eventId, pkgItems: pkg.items };
  });

  if (!options?.deferTotals) {
    await persistQuoteTotals(quoteId);
  }

  if (created.eventId) {
    await syncMenuPreferencesForPackage(
      created.eventId,
      packageId,
      catererId,
      created.pkgItems.map((item) => ({ label: item.label, quantity: item.quantity }))
    );
  }

  return {
    id: created.lineItem.id,
    packageId: created.lineItem.packageId!,
    unitPrice: created.lineItem.unitPrice,
    name: created.lineItem.name
  };
}

export async function removePackageFromQuote(
  quoteId: string,
  catererId: string,
  options?: { deferTotals?: boolean }
) {
  const quote = await loadQuoteForCaterer(quoteId, catererId);
  if (!quote) return null;

  await prisma.quoteLineItem.deleteMany({
    where: { quoteId, unitType: "tiered_per_head" }
  });

  // Kitchen sheet reads menu_preferences by eventId — clear so removed package
  // dishes cannot appear on the next PDF after the package is gone.
  if (quote.eventId) {
    await clearMenuPreferencesForEvent(quote.eventId);
  }

  if (!options?.deferTotals) {
    await persistQuoteTotals(quoteId);
  }
  return { ok: true as const };
}

export async function updateGuestCountOnly(
  quoteId: string,
  catererId: string,
  guestCount: number,
  options?: { deferTotals?: boolean }
) {
  const quoteMeta = await prisma.quote.findFirst({
    where: { id: quoteId, catererId },
    select: {
      id: true,
      eventId: true,
      taxRate: true,
      depositPct: true
    }
  });
  if (!quoteMeta?.eventId) return null;

  await prisma.event.update({
    where: { id: quoteMeta.eventId },
    data: { guestCountEstimate: guestCount }
  });

  if (options?.deferTotals) {
    return { guestCount };
  }

  const full = await loadQuoteForCaterer(quoteId, catererId);
  if (!full) return null;

  const { grandTotal } = calculateQuoteTotals(
    full.lineItems,
    full.taxRate,
    full.depositPct,
    guestCount
  );

  await prisma.quote.update({
    where: { id: quoteId },
    data: { totalAmount: grandTotal }
  });

  return {
    ...full,
    totalAmount: grandTotal,
    event: full.event ? { ...full.event, guestCountEstimate: guestCount } : full.event
  };
}

export async function updatePackageTierOnQuote(
  quoteId: string,
  catererId: string,
  tierId: string,
  options?: { deferTotals?: boolean }
) {
  const quote = await loadQuoteForCaterer(quoteId, catererId);
  if (!quote) return null;

  const packageLine = quote.lineItems.find((item) => item.unitType === "tiered_per_head");
  if (!packageLine?.packageId) {
    throw Object.assign(new Error("No package on this quote."), { status: 400 });
  }

  const pkg = await prisma.cateringPackage.findFirst({
    where: { id: packageLine.packageId, catererId },
    include: { tiers: { orderBy: { minGuests: "asc" } } }
  });
  if (!pkg) {
    throw Object.assign(new Error("Package not found."), { status: 404 });
  }

  const tier = pkg.tiers.find((row) => row.id === tierId);
  if (!tier) {
    throw Object.assign(new Error("Invalid pricing tier."), { status: 400 });
  }

  await prisma.quoteLineItem.update({
    where: { id: packageLine.id },
    data: {
      unitPrice: tier.pricePerHead,
      appliedTier: tier.pricePerHead,
      appliedTierLabel: formatTierLabel(tier),
      notes: formatTierLabel(tier)
    }
  });

  if (options?.deferTotals) {
    return quote;
  }

  await persistQuoteTotals(quoteId);
  return loadQuoteForCaterer(quoteId, catererId);
}

export async function bumpQuoteRevision(quoteId: string): Promise<number> {
  const updated = await prisma.quote.update({
    where: { id: quoteId },
    data: { revision: { increment: 1 } },
    select: { revision: true }
  });
  return updated.revision;
}
