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
