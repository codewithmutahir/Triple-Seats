import type { ItemCategory, MenuItem } from "@/components/quote/types";

export type PackageSelectionEntry = { id: string; name: string };

export type PackageSelections = Record<string, Record<string, PackageSelectionEntry[]>>;

export type UiPackageSelectionEntry = { id: string; name: string };

export type UiPackageSelections = Record<string, Record<string, UiPackageSelectionEntry[]>>;

function findMenuItemName(
  id: string,
  menuItemsByCategory: Partial<Record<ItemCategory, MenuItem[]>>
): string | undefined {
  for (const items of Object.values(menuItemsByCategory)) {
    const match = items?.find((item) => item.id === id);
    if (match) return match.name;
  }
  return undefined;
}

export function storedSelectionsToUi(
  stored: PackageSelections | null | undefined
): UiPackageSelections {
  const result: UiPackageSelections = {};
  if (!stored) return result;

  for (const [category, byLabel] of Object.entries(stored)) {
    const slots: Record<string, UiPackageSelectionEntry[]> = {};
    for (const [label, entries] of Object.entries(byLabel ?? {})) {
      slots[label] = entries.map((entry) => ({ id: entry.id, name: entry.name }));
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
    for (const [label, entries] of Object.entries(byLabel)) {
      if (!entries.length) continue;
      const mapped = entries.map((entry) => ({
        id: entry.id,
        name:
          entry.name ||
          findMenuItemName(entry.id, menuItemsByCategory) ||
          "Unknown item"
      }));
      if (!result[category]) result[category] = {};
      result[category][label] = mapped;
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
