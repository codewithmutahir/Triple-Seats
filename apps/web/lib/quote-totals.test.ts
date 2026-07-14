import { describe, expect, it } from "vitest";

import {
  calculateQuoteTotals,
  formatTaxRatePercent,
  getActiveTier,
  lineItemTotal,
  packageLineTotal,
  tiersEqual,
  tiersForCustomerType
} from "./quote-totals";

const b2cTiers = [
  { minGuests: 50, maxGuests: 99, pricePerHead: 28, customerType: "b2c" as const },
  { minGuests: 100, maxGuests: null, pricePerHead: 24, customerType: "b2c" as const }
];

const mixedTiers = [
  ...b2cTiers,
  { minGuests: 50, maxGuests: null, pricePerHead: 22, customerType: "b2b" as const }
];

describe("formatTaxRatePercent", () => {
  it("formats 8.75% without trailing zeros noise", () => {
    expect(formatTaxRatePercent(0.0875)).toBe("8.75");
  });

  it("formats whole percents cleanly", () => {
    expect(formatTaxRatePercent(0.08)).toBe("8");
  });
});

describe("getActiveTier", () => {
  it("returns null for empty tiers or non-positive guests", () => {
    expect(getActiveTier([], 100)).toBeNull();
    expect(getActiveTier(b2cTiers, 0)).toBeNull();
  });

  it("picks matching guest band", () => {
    expect(getActiveTier(b2cTiers, 75)?.pricePerHead).toBe(28);
    expect(getActiveTier(b2cTiers, 150)?.pricePerHead).toBe(24);
  });

  it("filters by customer type", () => {
    expect(getActiveTier(mixedTiers, 80, "b2b")?.pricePerHead).toBe(22);
    expect(getActiveTier(mixedTiers, 80, "b2c")?.pricePerHead).toBe(28);
  });
});

describe("tiersForCustomerType / tiersEqual", () => {
  it("returns matching customer pool", () => {
    expect(tiersForCustomerType(mixedTiers, "b2b")).toHaveLength(1);
    expect(tiersForCustomerType(mixedTiers, "b2c")).toHaveLength(2);
  });

  it("compares tiers by band and price", () => {
    expect(tiersEqual(b2cTiers[0]!, b2cTiers[0]!)).toBe(true);
    expect(tiersEqual(b2cTiers[0]!, b2cTiers[1]!)).toBe(false);
  });
});

describe("lineItemTotal / packageLineTotal", () => {
  it("computes per_head against guest count", () => {
    expect(
      lineItemTotal({ unitPrice: 10, quantity: 2, unitType: "per_head" }, 50)
    ).toBe(1000);
  });

  it("uses appliedTier for tiered_per_head", () => {
    expect(
      lineItemTotal(
        { unitPrice: 99, quantity: 1, unitType: "tiered_per_head", appliedTier: 25 },
        40
      )
    ).toBe(1000);
  });

  it("coerces equipment per_head to per_piece", () => {
    expect(
      lineItemTotal(
        { unitPrice: 15, quantity: 4, unitType: "per_head", category: "equipment" },
        100
      )
    ).toBe(60);
  });

  it("computes package line from tier", () => {
    expect(packageLineTotal(b2cTiers[1]!, 120, 1)).toBe(2880);
    expect(packageLineTotal(null, 120)).toBe(0);
  });
});

describe("calculateQuoteTotals", () => {
  it("sums line items and applies tax + deposit", () => {
    const totals = calculateQuoteTotals(
      [
        { unitPrice: 10, quantity: 1, unitType: "flat" },
        { unitPrice: 5, quantity: 2, unitType: "per_piece" }
      ],
      0.1,
      0.5,
      10
    );

    expect(totals.subtotal).toBe(20);
    expect(totals.tax).toBe(2);
    expect(totals.grandTotal).toBe(22);
    expect(totals.deposit).toBe(11);
    expect(totals.balance).toBe(11);
  });

  it("uses default 8.75% tax style numbers", () => {
    const totals = calculateQuoteTotals(
      [{ unitPrice: 100, quantity: 1, unitType: "flat" }],
      0.0875,
      0.5,
      0
    );
    expect(totals.subtotal).toBe(100);
    expect(totals.tax).toBeCloseTo(8.75);
    expect(totals.grandTotal).toBeCloseTo(108.75);
  });
});
