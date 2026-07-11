/** Maps package included item labels to quote menu sections. */
const PACKAGE_ITEM_SECTIONS: Record<
  string,
  | "appetizer"
  | "veg_gravy"
  | "chicken_gravy"
  | "mutton_gravy"
  | "rice_chicken"
  | "rice_mutton"
  | "breads"
  | "side_items"
  | "bbq"
  | "dessert"
  | "beverages"
> = {
  Appetizer: "appetizer",
  "Veg Gravy": "veg_gravy",
  "Chicken Gravy": "chicken_gravy",
  "Mutton Gravy": "mutton_gravy",
  "Rice Chicken": "rice_chicken",
  "Rice Mutton": "rice_mutton",
  Grill: "bbq",
  Dessert: "dessert",
  Naan: "breads",
  Salad: "side_items",
  Raita: "side_items",
  "Mirchi Ka Salan": "side_items",
  Beverages: "beverages"
};

export type PackageSelectionEntry = { id: string; name: string };

/** category -> slot label -> selected menu items */
export type PackageSelections = Record<string, Record<string, PackageSelectionEntry[]>>;

type IncludedItem = { label: string; quantity: number };

export function parsePackageSelections(value: unknown): PackageSelections | null {
  if (value === null || value === undefined) return {};
  if (typeof value !== "object" || Array.isArray(value)) return null;

  const result: PackageSelections = {};
  for (const [category, slots] of Object.entries(value as Record<string, unknown>)) {
    if (typeof category !== "string" || typeof slots !== "object" || slots === null || Array.isArray(slots)) {
      return null;
    }
    result[category] = {};
    for (const [label, entries] of Object.entries(slots as Record<string, unknown>)) {
      if (!Array.isArray(entries)) return null;
      const parsed: PackageSelectionEntry[] = [];
      for (const entry of entries) {
        if (
          typeof entry !== "object" ||
          entry === null ||
          typeof (entry as PackageSelectionEntry).id !== "string" ||
          typeof (entry as PackageSelectionEntry).name !== "string"
        ) {
          return null;
        }
        parsed.push({
          id: (entry as PackageSelectionEntry).id,
          name: (entry as PackageSelectionEntry).name
        });
      }
      result[category][label] = parsed;
    }
  }
  return result;
}

export function normalizePackageSelections(value: unknown): PackageSelections {
  return parsePackageSelections(value) ?? {};
}

const SELECTION_CATEGORY_ORDER = [
  "appetizer",
  "veg_gravy",
  "chicken_gravy",
  "mutton_gravy",
  "rice_chicken",
  "rice_mutton",
  "breads",
  "bbq",
  "side_items",
  "dessert",
  "beverages"
] as const;

const SELECTION_CATEGORY_LABELS: Record<(typeof SELECTION_CATEGORY_ORDER)[number], string> = {
  appetizer: "Appetizer",
  veg_gravy: "Veg Gravy",
  chicken_gravy: "Chicken Gravy",
  mutton_gravy: "Mutton Gravy",
  rice_chicken: "Rice & Chicken",
  rice_mutton: "Rice & Mutton",
  breads: "Breads",
  bbq: "BBQ",
  side_items: "Side Items",
  dessert: "Dessert",
  beverages: "Beverages"
};

export type PackageSelectionGroup = {
  category: (typeof SELECTION_CATEGORY_ORDER)[number];
  categoryLabel: string;
  slotLabel: string;
  items: PackageSelectionEntry[];
};

export function listPackageSelectionGroups(
  selections: PackageSelections | null | undefined
): PackageSelectionGroup[] {
  const normalized = normalizePackageSelections(selections);
  const groups: PackageSelectionGroup[] = [];

  for (const category of SELECTION_CATEGORY_ORDER) {
    const slots = normalized[category];
    if (!slots) continue;
    for (const [slotLabel, items] of Object.entries(slots)) {
      if (!items.length) continue;
      groups.push({
        category,
        categoryLabel: SELECTION_CATEGORY_LABELS[category],
        slotLabel,
        items
      });
    }
  }

  return groups;
}

function slotHasSelections(
  selections: PackageSelections | null | undefined,
  label: string
): PackageSelectionEntry[] | null {
  if (!selections) return null;

  const section = PACKAGE_ITEM_SECTIONS[label];
  if (section && selections[section]?.[label]?.length) {
    return selections[section][label];
  }

  // Fallback: find slot by label in any category (handles legacy/mismatched keys).
  for (const slots of Object.values(selections)) {
    const entries = slots[label];
    if (entries?.length) return entries;
  }

  return null;
}

export function formatPackageIncludesWithSelections(
  items: IncludedItem[],
  selections: PackageSelections | null | undefined
): string {
  return items
    .map((item) => {
      const picked = slotHasSelections(selections, item.label);
      if (picked?.length) {
        return `${item.label}: ${picked.map((entry) => entry.name).join(", ")}`;
      }
      return item.quantity > 1 ? `${item.label} ×${item.quantity}` : item.label;
    })
    .join(", ");
}

export type PackageIncludeLine = {
  label: string;
  detail: string;
};

/** One row per package slot — avoids PDF truncation from long comma-separated strings. */
export function listPackageIncludeLines(
  items: IncludedItem[],
  selections: PackageSelections | null | undefined
): PackageIncludeLine[] {
  return items.map((item) => {
    const picked = slotHasSelections(selections, item.label);
    if (picked?.length) {
      return {
        label: item.label,
        detail: picked.map((entry) => entry.name).join(", ")
      };
    }
    if (item.quantity > 1) {
      return {
        label: item.label,
        detail: `Up to ${item.quantity} items (not selected)`
      };
    }
    return {
      label: item.label,
      detail: "Not selected"
    };
  });
}
