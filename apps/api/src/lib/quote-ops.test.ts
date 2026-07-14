import { describe, expect, it } from "vitest";

import { parseQuoteOps, QuoteOpError } from "./quote-ops";

describe("parseQuoteOps", () => {
  it("parses a mixed batch of valid ops", () => {
    const ops = parseQuoteOps([
      {
        type: "add_item",
        clientRequestId: "temp_1",
        category: "dessert",
        name: "Gulab Jamun",
        unitPrice: 4,
        unitType: "per_piece",
        quantity: 2
      },
      { type: "remove_item", itemId: "item_abc" },
      {
        type: "update_item",
        itemId: "item_abc",
        patch: { quantity: 3 }
      },
      { type: "set_guest_count", guestCount: 120.7 },
      { type: "add_package", packageId: "pkg_1", tierId: "tier_1" },
      { type: "remove_package" },
      { type: "set_package_tier", tierId: "tier_2" }
    ]);

    expect(ops).toHaveLength(7);
    expect(ops[0]).toMatchObject({ type: "add_item", clientRequestId: "temp_1" });
    expect(ops[3]).toEqual({ type: "set_guest_count", guestCount: 120 });
    expect(ops[4]).toMatchObject({ type: "add_package", packageId: "pkg_1", tierId: "tier_1" });
  });

  it("rejects empty and oversized batches", () => {
    expect(() => parseQuoteOps([])).toThrow(QuoteOpError);
    expect(() => parseQuoteOps(Array.from({ length: 51 }, () => ({ type: "remove_package" })))).toThrow(
      /Too many operations/
    );
  });

  it("rejects unknown op types", () => {
    expect(() => parseQuoteOps([{ type: "explode" }])).toThrow(/Unknown operation type/);
  });

  it("requires clientRequestId for add_item", () => {
    expect(() =>
      parseQuoteOps([
        {
          type: "add_item",
          category: "dessert",
          name: "Kheer",
          unitPrice: 5,
          unitType: "per_piece"
        }
      ])
    ).toThrow(/clientRequestId/);
  });

  it("requires non-empty update patch", () => {
    expect(() =>
      parseQuoteOps([{ type: "update_item", itemId: "x", patch: {} }])
    ).toThrow(/patch cannot be empty/);
  });

  it("rejects negative guest counts", () => {
    expect(() => parseQuoteOps([{ type: "set_guest_count", guestCount: -1 }])).toThrow(
      /non-negative/
    );
  });
});
