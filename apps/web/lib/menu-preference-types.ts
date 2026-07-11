import type { ItemCategory, MenuItem, PackageIncludedItem } from "@/components/quote/types";

export type MenuPreferenceEntry = {
  slotLabel: string;
  selectedItem: string;
};

export type MenuPreferencesPayload = {
  hasPackage: boolean;
  quoteId?: string;
  packageId?: string;
  packageName?: string;
  slotLabels?: string[];
  packageItems?: PackageIncludedItem[];
  preferences?: MenuPreferenceEntry[];
  totalSlots?: number;
  configuredCount?: number;
  menuItemsByCategory?: Partial<Record<ItemCategory, MenuItem[]>>;
};

export type MenuPreferencesSaveInput = {
  preferences: MenuPreferenceEntry[];
};
