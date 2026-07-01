export type PackagePriceTierLike = {
  minGuests: number;
  maxGuests: number | null;
  pricePerHead: number;
};

export type QuoteLineItemLike = {
  unitPrice: number;
  quantity: number;
  unitType: string;
  appliedTier?: number | null;
};

export type QuoteTotals = {
  subtotal: number;
  tax: number;
  grandTotal: number;
  deposit: number;
  balance: number;
};

export function getActiveTier(
  tiers: PackagePriceTierLike[],
  guestCount: number
): PackagePriceTierLike | null {
  const sorted = [...tiers].sort((a, b) => a.minGuests - b.minGuests);
  return (
    sorted.find(
      (tier) =>
        guestCount >= tier.minGuests &&
        (tier.maxGuests === null || guestCount <= tier.maxGuests)
    ) ?? null
  );
}

export function formatTierLabel(tier: PackagePriceTierLike): string {
  const range = tier.maxGuests
    ? `${tier.minGuests}-${tier.maxGuests}`
    : `${tier.minGuests}+`;
  return `${range} guests @ $${tier.pricePerHead}/person`;
}

export function formatTierRange(tier: PackagePriceTierLike): string {
  return tier.maxGuests ? `${tier.minGuests}-${tier.maxGuests}` : `${tier.minGuests}+`;
}

/** Guest count to use when a pricing tier is selected manually. */
export function guestCountForTier(tier: PackagePriceTierLike): number {
  return tier.minGuests;
}

export function packageLineTotal(
  tier: PackagePriceTierLike | null,
  guestCount: number,
  quantity = 1
): number {
  if (!tier) return 0;
  return tier.pricePerHead * Math.max(0, guestCount) * quantity;
}

function tieredPricePerHead(item: QuoteLineItemLike): number {
  if (item.appliedTier != null) {
    return item.appliedTier;
  }
  return item.unitPrice;
}

export function calculateQuoteTotals(
  lineItems: QuoteLineItemLike[],
  taxRate: number,
  depositPct: number,
  guestCount: number
): QuoteTotals {
  const guests = Math.max(0, guestCount);
  const subtotal = lineItems.reduce((sum, item) => {
    if (item.unitType === "per_head" || item.unitType === "tiered_per_head") {
      const pricePerHead =
        item.unitType === "tiered_per_head" ? tieredPricePerHead(item) : item.unitPrice;
      return sum + pricePerHead * guests * item.quantity;
    }
    return sum + item.unitPrice * item.quantity;
  }, 0);

  const tax = subtotal * taxRate;
  const grandTotal = subtotal + tax;
  const deposit = grandTotal * depositPct;
  const balance = grandTotal - deposit;

  return { subtotal, tax, grandTotal, deposit, balance };
}

export function lineItemTotal(
  item: QuoteLineItemLike,
  guestCount: number
): number {
  if (item.unitType === "per_head") {
    return item.unitPrice * Math.max(0, guestCount) * item.quantity;
  }
  if (item.unitType === "tiered_per_head") {
    return tieredPricePerHead(item) * Math.max(0, guestCount) * item.quantity;
  }
  return item.unitPrice * item.quantity;
}

/** USD with thousands separators (US locale). */
export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}
