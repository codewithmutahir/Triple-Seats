/** Guest bands for package kitchen prep quantity tables. */
export const KITCHEN_GUEST_BANDS = [100, 200, 300, 400, 500] as const;
export type KitchenGuestBand = (typeof KITCHEN_GUEST_BANDS)[number];

/**
 * Excel QTY Table Package — Banquet 1 defaults.
 * Mutton Gravy uses Banquet 2 (Banquet 1 was blank).
 */
export const DEFAULT_KITCHEN_QTY_BY_CATEGORY: Record<string, Record<KitchenGuestBand, number>> = {
  Appetizer: { 100: 3, 200: 5, 300: 6, 400: 8, 500: 10 },
  "Veg Gravy": { 100: 2, 200: 3, 300: 3, 400: 3, 500: 4 },
  "Chicken Gravy": { 100: 2, 200: 4, 300: 5, 400: 6, 500: 8 },
  "Mutton Gravy": { 100: 1, 200: 2, 300: 3, 400: 4, 500: 5 },
  "Rice Chicken": { 100: 4, 200: 8, 300: 10, 400: 13, 500: 16 },
  Grill: { 100: 2, 200: 4, 300: 6, 400: 8, 500: 10 },
  Dessert: { 100: 2, 200: 4, 300: 5, 400: 5, 500: 7 },
  Naan: { 100: 70, 200: 140, 300: 220, 400: 280, 500: 380 },
  Salad: { 100: 1, 200: 2, 300: 2, 400: 3, 500: 4 },
  Raita: { 100: 1, 200: 2, 300: 2, 400: 2, 500: 3 },
  "Mirchi Ka Salan": { 100: 1, 200: 1, 300: 1, 400: 2, 500: 2 }
};

export type KitchenQtyRow = {
  guestBand: number;
  category: string;
  quantity: number;
};

/** Build default kitchen qty rows for the given package included labels. */
export function buildDefaultKitchenQtys(labels: string[]): KitchenQtyRow[] {
  const unique = [...new Set(labels.map((l) => l.trim()).filter(Boolean))];
  const rows: KitchenQtyRow[] = [];

  for (const category of unique) {
    const defaults = DEFAULT_KITCHEN_QTY_BY_CATEGORY[category];
    for (const band of KITCHEN_GUEST_BANDS) {
      rows.push({
        guestBand: band,
        category,
        quantity: defaults?.[band] ?? 0
      });
    }
  }

  return rows;
}
