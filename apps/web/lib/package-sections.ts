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

/** When a package is selected, hide food categories covered by the package (B2B only). */
export function shouldShowQuoteCategory(
  category: ItemCategory,
  packageItems: PackageIncludedItem[] | undefined,
  customerType: "b2b" | "b2c" = "b2c"
): boolean {
  if (customerType === "b2c") return true;
  if (!packageItems?.length) return true;
  if (category === "equipment" || category === "delivery" || category === "beverages" || category === "labor") {
    return true;
  }
  const slots = getPackageSlotsForSection(packageItems, category);
  return slots === undefined;
}

/** True when the selected package includes this food category (for B2C section hints). */
export function isPackageCoveredCategory(
  category: ItemCategory,
  packageItems: PackageIncludedItem[] | undefined
): boolean {
  if (!packageItems?.length) return false;
  if (category === "equipment" || category === "delivery" || category === "beverages" || category === "labor") {
    return false;
  }
  return getPackageSlotsForSection(packageItems, category) !== undefined;
}
