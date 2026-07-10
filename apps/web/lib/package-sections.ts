import type { PackageIncludedItem } from "@/components/quote/types";
import { PACKAGE_ITEM_SECTIONS } from "@/lib/event-customer-types";
import type { ItemCategory } from "@/components/quote/types";

const INCLUDED_SECTIONS: ItemCategory[] = [
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
];

export function isPackageIncludedSection(category: ItemCategory): boolean {
  return INCLUDED_SECTIONS.includes(category);
}

export function packageItemsForSection(
  items: PackageIncludedItem[],
  category: ItemCategory
): PackageIncludedItem[] {
  return items.filter((item) => PACKAGE_ITEM_SECTIONS[item.label] === category);
}

/** Returns package slots only when the selected package includes that category. */
export function getPackageSlotsForSection(
  items: PackageIncludedItem[] | undefined,
  category: ItemCategory
): PackageIncludedItem[] | undefined {
  if (!items?.length) return undefined;
  const slots = packageItemsForSection(items, category);
  return slots.length > 0 ? slots : undefined;
}
