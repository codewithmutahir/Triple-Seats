export type SettingsProfile = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  timezone: string | null;
  currencyCode: string;
  websiteUrl: string | null;
  slug: string | null;
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

export type SettingsPackageKitchenQty = {
  guestBand: number;
  category: string;
  quantity: number;
};

export type SettingsPackage = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  minGuests: number;
  tiers: SettingsPackageTier[];
  items: SettingsPackageItem[];
  kitchenQtys: SettingsPackageKitchenQty[];
};

export type SettingsCloverConnection = {
  connected: boolean;
  configured: boolean;
  source: "caterer" | "env" | "none";
  oauthConnected: boolean;
  oauthAvailable: boolean;
  merchantId: string | null;
  publicKey: string | null;
  hasPrivateKey: boolean;
  hasWebhookSecret: boolean;
  privateKeyHint: string | null;
  webhookSecretHint: string | null;
  connectedAt: string | null;
  webhookUrl: string;
  successUrl: string;
  failureUrl: string;
  cancelUrl: string;
};

export type SettingsItemCategory =
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
  | "equipment"
  | "delivery"
  | "labor"
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
  veg_gravy: [],
  chicken_gravy: [],
  mutton_gravy: [],
  rice_chicken: [],
  rice_mutton: [],
  breads: [],
  side_items: [],
  bbq: [],
  dessert: [],
  beverages: [],
  equipment: [],
  delivery: [],
  labor: [],
  other: []
};
