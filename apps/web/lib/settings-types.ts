export type SettingsProfile = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  timezone: string | null;
  currencyCode: string;
  websiteUrl: string | null;
};

export type SettingsPackageTier = {
  id: string;
  customerType: "b2b" | "b2c";
  minGuests: number;
  maxGuests: number | null;
  pricePerHead: number;
};

export type SettingsPackageItem = {
  id: string;
  label: string;
  quantity: number;
  sortOrder: number;
};

export type SettingsPackage = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  minGuests: number;
  tiers: SettingsPackageTier[];
  items: SettingsPackageItem[];
};

export type SettingsItemCategory =
  | "appetizer"
  | "main_course"
  | "bbq"
  | "dessert"
  | "equipment"
  | "delivery"
  | "other";

export type SettingsMenuItem = {
  id: string;
  catererId: string;
  category: SettingsItemCategory;
  name: string;
  defaultPrice: number | null;
  defaultUnit: "per_head" | "by_tray" | "flat" | "per_piece";
  usageCount: number;
  isDefault: boolean;
};

export type SettingsMenuItemsByCategory = Record<SettingsItemCategory, SettingsMenuItem[]>;

export const EMPTY_MENU_ITEMS_BY_CATEGORY: SettingsMenuItemsByCategory = {
  appetizer: [],
  main_course: [],
  bbq: [],
  dessert: [],
  equipment: [],
  delivery: [],
  other: []
};
