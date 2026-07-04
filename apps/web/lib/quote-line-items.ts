import type { AddItemPayload } from "@/components/quote/add-item-form";
import type { ItemCategory, QuoteLineItem } from "@/components/quote/types";

type LineItemPayload = AddItemPayload & { category: ItemCategory };

function matchesPayload(item: QuoteLineItem, payload: LineItemPayload): boolean {
  return (
    item.category === payload.category &&
    item.name === payload.name &&
    (item.menuItemId ?? null) === (payload.menuItemId ?? null) &&
    item.unitType === payload.unitType &&
    Math.abs(item.unitPrice - payload.unitPrice) < 0.001 &&
    Math.abs(item.quantity - payload.quantity) < 0.001
  );
}

/** Resolve the server-created row for an optimistic temp add. */
export function resolveCreatedLineItem(
  serverItems: QuoteLineItem[],
  prevItems: QuoteLineItem[],
  payload: LineItemPayload
): QuoteLineItem | undefined {
  const prevRealIds = new Set(
    prevItems.filter((item) => !item.id.startsWith("temp_")).map((item) => item.id)
  );
  const newlyCreated = serverItems.filter((item) => !prevRealIds.has(item.id));
  if (newlyCreated.length === 1) return newlyCreated[0];
  return newlyCreated.find((item) => matchesPayload(item, payload));
}

export function equipmentUnitFromCatalog(
  defaultUnit: string | undefined
): "flat" | "per_piece" {
  return defaultUnit === "flat" ? "flat" : "per_piece";
}
