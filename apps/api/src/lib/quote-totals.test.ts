import { describe, expect, it } from "vitest";

import { calculateQuoteTotals, getActiveTier, lineItemTotal } from "./quote-totals";

describe("api quote-totals", () => {
  it("matches web calculation for mixed units", () => {
    const totals = calculateQuoteTotals(
      [
        { unitPrice: 20, quantity: 1, unitType: "tiered_per_head", appliedTier: 20 },
        { unitPrice: 50, quantity: 1, unitType: "flat" }
      ],
      0.0875,
      0.5,
      100
    );

    expect(totals.subtotal).toBe(2050);
    expect(totals.tax).toBeCloseTo(179.375);
    expect(totals.grandTotal).toBeCloseTo(2229.375);
    expect(totals.deposit).toBeCloseTo(1114.6875);
  });

  it("selects open-ended tier", () => {
    const tier = getActiveTier(
      [{ minGuests: 200, maxGuests: null, pricePerHead: 18, customerType: "b2c" }],
      250,
      "b2c"
    );
    expect(tier?.pricePerHead).toBe(18);
  });

  it("charges flat items independent of guest count", () => {
    expect(lineItemTotal({ unitPrice: 75, quantity: 2, unitType: "flat" }, 999)).toBe(150);
  });
});
