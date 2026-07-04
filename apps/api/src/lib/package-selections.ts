/** Maps package included item labels to quote menu sections. */
const PACKAGE_ITEM_SECTIONS: Record<string, "appetizer" | "main_course" | "bbq" | "dessert"> = {
  Appetizer: "appetizer",
  "Veg Gravy": "main_course",
  "Chicken Gravy": "main_course",
  "Mutton Gravy": "main_course",
  "Rice Chicken": "main_course",
  Grill: "bbq",
  Dessert: "dessert",
  Naan: "main_course",
  Salad: "main_course",
  Raita: "main_course",
  "Mirchi Ka Salan": "main_course"
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

function slotHasSelections(
  selections: PackageSelections | null | undefined,
  label: string
): PackageSelectionEntry[] | null {
  const section = PACKAGE_ITEM_SECTIONS[label];
  if (!section || !selections?.[section]?.[label]?.length) return null;
  return selections[section][label];
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
