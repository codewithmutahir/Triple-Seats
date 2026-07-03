import type { PackageIncludedItem } from "@/components/quote/types";
import { PACKAGE_ITEM_SECTIONS } from "@/lib/event-customer-types";
import type { ItemCategory } from "@/components/quote/types";

const INCLUDED_SECTIONS: ItemCategory[] = ["appetizer", "main_course", "bbq", "dessert"];

export function isPackageIncludedSection(category: ItemCategory): boolean {
  return INCLUDED_SECTIONS.includes(category);
}

export function packageItemsForSection(
  items: PackageIncludedItem[],
  category: ItemCategory
): PackageIncludedItem[] {
  return items.filter((item) => PACKAGE_ITEM_SECTIONS[item.label] === category);
}
