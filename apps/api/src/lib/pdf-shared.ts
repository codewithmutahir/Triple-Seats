import { getCategoryLabel } from "./category-labels";
import type { QuoteWithRelations } from "./quote-serialize";

export const PDF_NAVY = "#1B2A4A";

export const PDF_CATEGORY_ORDER = [
  "appetizer",
  "veg_gravy",
  "chicken_gravy",
  "mutton_gravy",
  "rice_chicken",
  "rice_mutton",
  "breads",
  "side_items",
  "bbq",
  "dessert",
  "beverages",
  "equipment",
  "delivery",
  "labor",
  "other"
] as const;

export function getCategoryDisplayName(category: string): string {
  try {
    return getCategoryLabel(category).toUpperCase();
  } catch {
    return category.replace(/_/g, " ").toUpperCase();
  }
}

export function formatPdfDate(iso: Date | string | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatTimeFromIso(iso: Date | string | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function formatPdfEventTimeRange(
  startTime: Date | string | null | undefined,
  endTime: Date | string | null | undefined
): string {
  const start = formatTimeFromIso(startTime);
  if (!start) return "—";
  const end = formatTimeFromIso(endTime);
  if (!end) return start;
  return `${start} – ${end}`;
}

type EventTimeFields = {
  eventTime?: string | null;
  startTime?: Date | string | null;
  endTime?: Date | string | null;
};

/** Prefer editable eventTime string; fall back to start/end timestamps. */
export function formatPdfEventTime(event: EventTimeFields | null | undefined): string {
  const manual = event?.eventTime?.trim();
  if (manual) return manual;
  return formatPdfEventTimeRange(event?.startTime, event?.endTime);
}

export function guestDisplayName(quote: QuoteWithRelations): string {
  const g = quote.event?.primaryGuest;
  if (!g) return "Guest";
  return [g.firstName, g.lastName].filter(Boolean).join(" ") || "Guest";
}

export function eventLocationDisplay(quote: QuoteWithRelations): string {
  const parts = [quote.event?.venueName, quote.event?.venueAddress].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Location TBD";
}

export function packageIncludeSummary(
  items: { label: string; quantity: number }[] | null | undefined
): string {
  if (!items?.length) return "—";
  return items
    .map((item) => (item.quantity > 1 ? `${item.label} ×${item.quantity}` : item.label))
    .join(", ");
}

/** Group menu preferences by base slot label for PDF/kitchen display. */
export function groupMenuPreferencesForDisplay(
  preferences: { slotLabel: string; selectedItem: string }[],
  packageItems?: { label: string; quantity: number }[] | null
): { label: string; items: string[] }[] {
  if (!preferences.length) return [];

  const order = packageItems?.map((p) => p.label) ?? [];
  const groups = new Map<string, string[]>();

  for (const pref of preferences) {
    if (!pref.selectedItem?.trim()) continue;
    const match = pref.slotLabel.match(/^(.+?) Slot \d+$/);
    const label = match?.[1] ?? pref.slotLabel;
    const list = groups.get(label) ?? [];
    list.push(pref.selectedItem.trim());
    groups.set(label, list);
  }

  const ordered: { label: string; items: string[] }[] = [];
  for (const label of order) {
    const items = groups.get(label);
    if (items?.length) {
      ordered.push({ label, items });
      groups.delete(label);
    }
  }
  for (const [label, items] of groups) {
    ordered.push({ label, items });
  }
  return ordered;
}

export function formatPackageSelectedMenuSummary(
  preferences: { slotLabel: string; selectedItem: string }[],
  packageItems?: { label: string; quantity: number }[] | null
): string | null {
  const groups = groupMenuPreferencesForDisplay(preferences, packageItems);
  if (!groups.length) return null;
  return groups
    .map(({ label, items }) =>
      items.length > 1 ? `${label} ×${items.length} (${items.join(", ")})` : `${label} (${items[0]})`
    )
    .join(", ");
}

export function kitchenPortionLabel(
  guestCount: number,
  unitType: string,
  quantity: number,
  category?: string
): string {
  const effectiveUnit =
    category === "equipment" && unitType === "per_head" ? "per_piece" : unitType;

  if (effectiveUnit === "flat") {
    if (category === "labor") {
      return quantity === 1 ? "1 person" : `${quantity} persons`;
    }
    return quantity === 1 ? "1 unit" : `${quantity} units`;
  }
  if (effectiveUnit === "by_tray") {
    return quantity === 1 ? "1 tray" : `${quantity} trays`;
  }
  if (effectiveUnit === "per_piece") {
    return quantity === 1 ? "1 piece" : `${quantity} pieces`;
  }

  const portions = Math.max(0, guestCount) * Math.max(1, quantity);
  return `${portions} portions`;
}

export function categoriesWithItems<T>(itemsByCategory: Map<string, T[]>): string[] {
  const ordered = PDF_CATEGORY_ORDER.filter((cat) => (itemsByCategory.get(cat) ?? []).length > 0);
  const extras = [...itemsByCategory.keys()].filter(
    (cat) =>
      !(PDF_CATEGORY_ORDER as readonly string[]).includes(cat) &&
      (itemsByCategory.get(cat) ?? []).length > 0
  );
  return [...ordered, ...extras];
}

export function groupLineItemsByCategory(lineItems: QuoteWithRelations["lineItems"]) {
  const map = new Map<string, QuoteWithRelations["lineItems"]>();
  for (const item of lineItems) {
    if (item.unitType === "tiered_per_head") continue;
    const list = map.get(item.category) ?? [];
    list.push(item);
    map.set(item.category, list);
  }
  return map;
}
