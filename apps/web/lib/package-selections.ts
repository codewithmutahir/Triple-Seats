import type { ItemCategory, MenuItem } from "@/components/quote/types";

export type PackageSelectionEntry = { id: string; name: string };

export type PackageSelections = Record<string, Record<string, PackageSelectionEntry[]>>;

export type UiPackageSelections = Record<string, Record<string, string[]>>;

export function storedSelectionsToUi(
  stored: PackageSelections | null | undefined
): UiPackageSelections {
  const result: UiPackageSelections = {};
  if (!stored) return result;

  for (const [category, byLabel] of Object.entries(stored)) {
    const slots: Record<string, string[]> = {};
    for (const [label, entries] of Object.entries(byLabel ?? {})) {
      slots[label] = entries.map((entry) => entry.id);
    }
    result[category] = slots;
  }
  return result;
}

export function uiSelectionsToStored(
  ui: UiPackageSelections,
  menuItemsByCategory: Partial<Record<ItemCategory, MenuItem[]>>
): PackageSelections {
  const result: PackageSelections = {};

  for (const [category, byLabel] of Object.entries(ui)) {
    for (const [label, ids] of Object.entries(byLabel)) {
      if (!ids.length) continue;
      const catalog = menuItemsByCategory[category as ItemCategory] ?? [];
      const entries = ids.map((id) => {
        const item = catalog.find((menuItem) => menuItem.id === id);
        return { id, name: item?.name ?? "Item" };
      });
      if (!result[category]) result[category] = {};
      result[category][label] = entries;
    }
  }

  return result;
}

export function packageSelectionsEqual(
  a: PackageSelections | null | undefined,
  b: PackageSelections | null | undefined
): boolean {
  return JSON.stringify(normalizeForCompare(a)) === JSON.stringify(normalizeForCompare(b));
}

function normalizeForCompare(value: PackageSelections | null | undefined): PackageSelections {
  if (!value) return {};
  const sorted: PackageSelections = {};
  for (const category of Object.keys(value).sort()) {
    sorted[category] = {};
    for (const label of Object.keys(value[category] ?? {}).sort()) {
      sorted[category][label] = [...(value[category]?.[label] ?? [])].sort((x, y) =>
        x.id.localeCompare(y.id)
      );
    }
  }
  return sorted;
}
