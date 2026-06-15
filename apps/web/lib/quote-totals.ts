export type QuoteLineItemLike = {
  unitPrice: number;
  quantity: number;
  unitType: string;
};

export type QuoteTotals = {
  subtotal: number;
  tax: number;
  grandTotal: number;
  deposit: number;
  balance: number;
};

export function calculateQuoteTotals(
  lineItems: QuoteLineItemLike[],
  taxRate: number,
  depositPct: number,
  guestCount: number
): QuoteTotals {
  const guests = Math.max(0, guestCount);
  const subtotal = lineItems.reduce((sum, item) => {
    if (item.unitType === "per_head") {
      return sum + item.unitPrice * guests * item.quantity;
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
