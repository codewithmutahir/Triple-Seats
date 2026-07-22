import { describe, expect, it } from "vitest";

import { coalesceQuoteOps } from "./quote-ops-coalesce";
import type { QuoteOp } from "./quote-ops-types";

describe("coalesceQuoteOps", () => {
  it("keeps only the latest guest count", () => {
    let ops: QuoteOp[] = [];
    ops = coalesceQuoteOps(ops, { type: "set_guest_count", guestCount: 50 });
    ops = coalesceQuoteOps(ops, { type: "set_guest_count", guestCount: 100 });
    expect(ops).toEqual([{ type: "set_guest_count", guestCount: 100 }]);
  });

  it("merges update_item patches for the same item", () => {
    let ops: QuoteOp[] = [];
    ops = coalesceQuoteOps(ops, {
      type: "update_item",
      itemId: "a",
      patch: { quantity: 1 }
    });
    ops = coalesceQuoteOps(ops, {
      type: "update_item",
      itemId: "a",
      patch: { unitPrice: 12 }
    });
    ops = coalesceQuoteOps(ops, {
      type: "update_item",
      itemId: "b",
      patch: { quantity: 2 }
    });

    expect(ops).toHaveLength(2);
    expect(ops[0]).toEqual({
      type: "update_item",
      itemId: "a",
      patch: { quantity: 1, unitPrice: 12 }
    });
  });

  it("clears package/tier ops when selecting a package", () => {
    let ops: QuoteOp[] = [
      { type: "set_package_tier", tierId: "old" },
      { type: "add_package", packageId: "pkg_old" },
      {
        type: "add_item",
        clientRequestId: "temp_1",
        category: "dessert",
        name: "Cake",
        unitPrice: 5,
        unitType: "per_piece"
      }
    ];

    ops = coalesceQuoteOps(ops, { type: "add_package", packageId: "pkg_new", tierId: "t1" });

    expect(ops).toEqual([
      {
        type: "add_item",
        clientRequestId: "temp_1",
        category: "dessert",
        name: "Cake",
        unitPrice: 5,
        unitType: "per_piece"
      },
      { type: "add_package", packageId: "pkg_new", tierId: "t1" }
    ]);
  });

  it("clears stale package ops on remove_package", () => {
    let ops: QuoteOp[] = [
      { type: "add_package", packageId: "pkg_1" },
      { type: "set_package_tier", tierId: "t1" }
    ];
    ops = coalesceQuoteOps(ops, { type: "remove_package" });
    expect(ops).toEqual([{ type: "remove_package" }]);
  });

  it("preserves unrelated ops while coalescing guest count", () => {
    let ops: QuoteOp[] = [
      { type: "remove_item", itemId: "x" },
      { type: "set_guest_count", guestCount: 10 }
    ];
    ops = coalesceQuoteOps(ops, { type: "set_guest_count", guestCount: 20 });
    expect(ops).toEqual([
      { type: "remove_item", itemId: "x" },
      { type: "set_guest_count", guestCount: 20 }
    ]);
  });

  it("dedupes remove_item and drops updates for removed ids", () => {
    let ops: QuoteOp[] = [];
    ops = coalesceQuoteOps(ops, {
      type: "update_item",
      itemId: "a",
      patch: { quantity: 2 }
    });
    ops = coalesceQuoteOps(ops, { type: "remove_item", itemId: "a" });
    ops = coalesceQuoteOps(ops, { type: "remove_item", itemId: "a" });
    ops = coalesceQuoteOps(ops, {
      type: "update_item",
      itemId: "a",
      patch: { quantity: 5 }
    });
    ops = coalesceQuoteOps(ops, {
      type: "update_item",
      itemId: "b",
      patch: { quantity: 1 }
    });

    expect(ops).toEqual([
      { type: "remove_item", itemId: "a" },
      { type: "update_item", itemId: "b", patch: { quantity: 1 } }
    ]);
  });
});
