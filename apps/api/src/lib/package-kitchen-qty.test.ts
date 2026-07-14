import { describe, expect, it } from "vitest";

import {
  formatKitchenTrayLabel,
  lookupKitchenQty,
  resolveKitchenBaseBand,
  scaleKitchenQty
} from "./package-kitchen-qty";

describe("resolveKitchenBaseBand", () => {
  it("uses 100 for guests below 100", () => {
    expect(resolveKitchenBaseBand(0)).toBe(100);
    expect(resolveKitchenBaseBand(50)).toBe(100);
    expect(resolveKitchenBaseBand(99)).toBe(100);
  });

  it("picks largest band at or below guest count", () => {
    expect(resolveKitchenBaseBand(100)).toBe(100);
    expect(resolveKitchenBaseBand(138)).toBe(100);
    expect(resolveKitchenBaseBand(200)).toBe(200);
    expect(resolveKitchenBaseBand(350)).toBe(300);
    expect(resolveKitchenBaseBand(500)).toBe(500);
    expect(resolveKitchenBaseBand(750)).toBe(500);
  });
});

describe("scaleKitchenQty", () => {
  it("scales and ceils naan example for 138 guests", () => {
    expect(scaleKitchenQty(138, 100, 70)).toBe(97);
  });

  it("returns table qty when guests match band", () => {
    expect(scaleKitchenQty(100, 100, 70)).toBe(70);
  });

  it("returns 0 for invalid inputs", () => {
    expect(scaleKitchenQty(0, 100, 70)).toBe(0);
    expect(scaleKitchenQty(138, 0, 70)).toBe(0);
    expect(scaleKitchenQty(138, 100, 0)).toBe(0);
  });
});

describe("lookupKitchenQty", () => {
  const matrix = [
    { guestBand: 100, category: "Naan", quantity: 70 },
    { guestBand: 200, category: "Naan", quantity: 140 },
    { guestBand: 100, category: "Appetizer", quantity: 3 }
  ];

  it("finds category and scales from base band", () => {
    expect(lookupKitchenQty(matrix, "Naan", 138)).toBe(97);
    expect(lookupKitchenQty(matrix, "Appetizer", 100)).toBe(3);
  });

  it("returns null when category missing", () => {
    expect(lookupKitchenQty(matrix, "Grill", 100)).toBeNull();
  });
});

describe("formatKitchenTrayLabel", () => {
  it("singular and plural", () => {
    expect(formatKitchenTrayLabel(1)).toBe("1 tray");
    expect(formatKitchenTrayLabel(97)).toBe("97 trays");
  });
});
