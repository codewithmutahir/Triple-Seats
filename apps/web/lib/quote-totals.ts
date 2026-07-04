export type PackagePriceTierLike = {
  minGuests: number;
  maxGuests: number | null;
  pricePerHead: number;
  customerType?: "b2b" | "b2c";
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

/** Display tax rate without spurious rounding (e.g. 0.0875 → "8.75", not "8.8"). */
export function formatTaxRatePercent(taxRate: number): string {
  return (taxRate * 100).toFixed(2).replace(/\.?0+$/, "");
}

export function getActiveTier(
  tiers: PackagePriceTierLike[],
  guestCount: number,
  customerType: "b2b" | "b2c" = "b2c"
): PackagePriceTierLike | null {
  return (
    tiers.find(
      (tier) =>
        tier.customerType === customerType &&
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
  const subtotal = lineItems.reduce((sum, item) => sum + lineItemTotal(item, guestCount), 0);

  const tax = subtotal * taxRate;
  const grandTotal = subtotal + tax;
  const deposit = grandTotal * depositPct;
  const balance = grandTotal - deposit;

  return { subtotal, tax, grandTotal, deposit, balance };
}

export function lineItemTotal(
  item: QuoteLineItemLike,
  guestCount: number,
  category?: string
): number {
  let unitType = item.unitType;
  if (category === "equipment" && unitType === "per_head") {
    unitType = "per_piece";
  }
  if (unitType === "per_head") {
    return item.unitPrice * Math.max(0, guestCount) * item.quantity;
  }
  if (unitType === "tiered_per_head") {
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
