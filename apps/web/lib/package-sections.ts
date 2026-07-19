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

/** Categories always available on the quote builder for both B2B and B2C. */
const ALWAYS_SHOW: ItemCategory[] = ["equipment", "delivery", "labor"];

/**
 * B2B: packages + equipment/delivery/labor only — no food à-la-carte sections.
 * B2C: show everything (package-covered categories may still show extras).
 */
export function shouldShowQuoteCategory(
  category: ItemCategory,
  _packageItems: PackageIncludedItem[] | undefined,
  customerType: "b2b" | "b2c" | string = "b2c"
): boolean {
  if (ALWAYS_SHOW.includes(category)) return true;
  // Normalize — never show food/à-la-carte sections for B2B
  if (String(customerType).toLowerCase() === "b2b") return false;
  return true;
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
