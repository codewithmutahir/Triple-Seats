import { KITCHEN_GUEST_BANDS, type KitchenGuestBand } from "./package-kitchen-qty-defaults";

export type KitchenQtyMatrixRow = {
  guestBand: number;
  category: string;
  quantity: number;
};

/** Largest kitchen band ≤ guestCount. Below 100 → 100; above 500 → 500. */
export function resolveKitchenBaseBand(guestCount: number): KitchenGuestBand {
  const guests = Math.max(0, Math.floor(guestCount));
  if (guests < 100) return 100;
  let base: KitchenGuestBand = 100;
  for (const band of KITCHEN_GUEST_BANDS) {
    if (band <= guests) base = band;
  }
  return base;
}

/** ceil((actualGuests × tableQty) / baseBand) */
export function scaleKitchenQty(
  actualGuests: number,
  baseBand: number,
  tableQty: number
): number {
  if (!Number.isFinite(actualGuests) || actualGuests <= 0) return 0;
  if (!Number.isFinite(baseBand) || baseBand <= 0) return 0;
  if (!Number.isFinite(tableQty) || tableQty <= 0) return 0;
  return Math.ceil((actualGuests * tableQty) / baseBand);
}

export function lookupKitchenQty(
  matrix: KitchenQtyMatrixRow[],
  categoryLabel: string,
  guestCount: number
): number | null {
  const category = categoryLabel.trim();
  if (!category) return null;

  const baseBand = resolveKitchenBaseBand(guestCount);
  const row = matrix.find(
    (entry) => entry.guestBand === baseBand && entry.category === category
  );
  if (!row || !Number.isFinite(row.quantity)) return null;

  return scaleKitchenQty(guestCount, baseBand, row.quantity);
}

export function formatKitchenTrayLabel(trays: number): string {
  if (trays === 1) return "1 tray";
  return `${trays} trays`;
}
