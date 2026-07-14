import { describe, expect, it } from "vitest";

import { resolveCreatedLineItem } from "./quote-line-items";
import type { QuoteLineItem } from "@/components/quote/types";

function item(partial: Partial<QuoteLineItem> & Pick<QuoteLineItem, "id" | "name">): QuoteLineItem {
  return {
    quoteId: "q1",
    menuItemId: null,
    packageId: null,
    category: "dessert",
    quantity: 1,
    unitPrice: 5,
    unitType: "per_piece",
    appliedTier: null,
    appliedTierLabel: null,
    notes: null,
    ...partial
  };
}

describe("resolveCreatedLineItem", () => {
  it("returns the single newly created server row", () => {
    const prev = [item({ id: "real_1", name: "Old" })];
    const server = [
      item({ id: "real_1", name: "Old" }),
      item({ id: "real_2", name: "New", quantity: 2, unitPrice: 6 })
    ];

    const resolved = resolveCreatedLineItem(server, [...prev, item({ id: "temp_1", name: "New" })], {
      category: "dessert",
      name: "New",
      quantity: 2,
      unitPrice: 6,
      unitType: "per_piece"
    });

    expect(resolved?.id).toBe("real_2");
  });

  it("matches by payload when multiple new rows exist", () => {
    const prev: QuoteLineItem[] = [];
    const server = [
      item({ id: "a", name: "A", quantity: 1 }),
      item({ id: "b", name: "B", quantity: 2, unitPrice: 9 })
    ];

    const resolved = resolveCreatedLineItem(server, prev, {
      category: "dessert",
      name: "B",
      quantity: 2,
      unitPrice: 9,
      unitType: "per_piece"
    });

    expect(resolved?.id).toBe("b");
  });
});
