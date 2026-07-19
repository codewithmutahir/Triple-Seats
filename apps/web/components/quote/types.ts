export type ItemCategory =
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

export type QuoteUnit = "per_head" | "by_tray" | "flat" | "per_piece" | "tiered_per_head";

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "archived";

export type PackagePriceTier = {
  id: string;
  customerType?: "b2b" | "b2c";
  minGuests: number;
  maxGuests: number | null;
  pricePerHead: number;
};

export type PackageIncludedItem = {
  id: string;
  label: string;
  quantity: number;
  sortOrder: number;
};

export type CateringPackage = {
  id: string;
  catererId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  minGuests: number;
  tiers: PackagePriceTier[];
  items: PackageIncludedItem[];
};

export type QuoteLineItemPackage = {
  id: string;
  name: string;
  minGuests: number;
  tiers: PackagePriceTier[];
  items: PackageIncludedItem[];
};

export type QuoteLineItem = {
  id: string;
  quoteId: string;
  menuItemId?: string | null;
  packageId?: string | null;
  category: ItemCategory;
  name: string;
  quantity: number;
  unitPrice: number;
  unitType: QuoteUnit;
  appliedTier: number | null;
  appliedTierLabel: string | null;
  notes: string | null;
  package?: QuoteLineItemPackage | null;
};

export type MenuItem = {
  id: string;
  catererId: string;
  category: ItemCategory;
  name: string;
  defaultPrice: number | null;
  defaultUnit: QuoteUnit;
  usageCount: number;
  isDefault: boolean;
};

export type QuoteEvent = {
  id: string;
  title: string;
  eventType?: string;
  eventTypeLabel?: string;
  customerType?: "b2b" | "b2c";
  /** Event pipeline status (lead / discussion / booked / …) */
  status?: string;
  eventDate: string;
  startTime?: string | null;
  endTime?: string | null;
  guestCountEstimate: number;
  venueAddress: string | null;
  venueName: string | null;
  guestName: string | null;
  primaryGuest?: {
    email: string | null;
  } | null;
};

export type Quote = {
  id: string;
  catererId: string;
  eventId: string;
  status: QuoteStatus;
  notes: string | null;
  taxRate: number;
  depositPct: number;
  dueDate: string | null;
  totalAmount: number;
  revision?: number;
  createdAt?: string;
  updatedAt?: string;
  packageSelections?: Record<string, Record<string, { id: string; name: string }[]>>;
  lineItems: QuoteLineItem[];
  event?: QuoteEvent;
};

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  appetizer: "APPETIZER",
  veg_gravy: "VEG GRAVY",
  chicken_gravy: "CHICKEN GRAVY",
  mutton_gravy: "MUTTON GRAVY",
  rice_chicken: "RICE & CHICKEN",
  rice_mutton: "RICE & MUTTON",
  breads: "BREADS",
  side_items: "SIDE ITEMS",
  bbq: "BBQ",
  dessert: "DESSERT",
  beverages: "BEVERAGES",
  equipment: "EQUIPMENT",
  delivery: "DELIVERY",
  labor: "LABOR & STAFFING",
  other: "OTHER"
};

export const MENU_SECTIONS: {
  category: ItemCategory;
  label: string;
  borderClass: string;
  emptyMessage: string;
}[] = [
  {
    category: "appetizer",
    label: "Appetizer",
    borderClass: "border-l-amber-500",
    emptyMessage: "No appetizers yet — add from suggestions above"
  },
  {
    category: "veg_gravy",
    label: "Veg Gravy",
    borderClass: "border-l-emerald-500",
    emptyMessage: "No veg gravy items yet — add from suggestions above"
  },
  {
    category: "chicken_gravy",
    label: "Chicken Gravy",
    borderClass: "border-l-orange-500",
    emptyMessage: "No chicken gravy items yet — add from suggestions above"
  },
  {
    category: "mutton_gravy",
    label: "Mutton Gravy",
    borderClass: "border-l-red-600",
    emptyMessage: "No mutton gravy items yet — add from suggestions above"
  },
  {
    category: "rice_chicken",
    label: "Rice & Chicken",
    borderClass: "border-l-yellow-500",
    emptyMessage: "No rice & chicken items yet — add from suggestions above"
  },
  {
    category: "rice_mutton",
    label: "Rice & Mutton",
    borderClass: "border-l-amber-600",
    emptyMessage: "No rice & mutton items yet — add from suggestions above"
  },
  {
    category: "breads",
    label: "Breads",
    borderClass: "border-l-stone-500",
    emptyMessage: "No breads yet — add from suggestions above"
  },
  {
    category: "bbq",
    label: "BBQ",
    borderClass: "border-l-red-500",
    emptyMessage: "No BBQ items yet — add from suggestions above"
  },
  {
    category: "side_items",
    label: "Side Items",
    borderClass: "border-l-lime-500",
    emptyMessage: "No side items yet — add from suggestions above"
  },
  {
    category: "dessert",
    label: "Dessert",
    borderClass: "border-l-pink-500",
    emptyMessage: "No desserts yet — add from suggestions above"
  },
  {
    category: "beverages",
    label: "Beverages",
    borderClass: "border-l-cyan-500",
    emptyMessage: "No beverages yet — add from suggestions above"
  },
  {
    category: "equipment",
    label: "Equipment",
    borderClass: "border-l-gray-400",
    emptyMessage: "No equipment yet — add from suggestions above"
  },
  {
    category: "delivery",
    label: "Delivery",
    borderClass: "border-l-indigo-400",
    emptyMessage: "No delivery charges yet"
  },
  {
    category: "labor",
    label: "Labor & Staff",
    borderClass: "border-l-violet-500",
    emptyMessage: "No staffing added yet — add servers, chefs, etc."
  }
];

export const MENU_SECTION_GROUPS: {
  groupLabel: string;
  categories: ItemCategory[];
}[] = [
  { groupLabel: "Starters", categories: ["appetizer"] },
  {
    groupLabel: "Main Course",
    categories: ["veg_gravy", "chicken_gravy", "mutton_gravy", "rice_chicken", "rice_mutton", "breads"]
  },
  { groupLabel: "BBQ", categories: ["bbq"] },
  { groupLabel: "Sides", categories: ["side_items"] },
  { groupLabel: "Dessert & Drinks", categories: ["dessert", "beverages"] },
  { groupLabel: "Logistics", categories: ["equipment", "delivery"] },
  { groupLabel: "Staffing", categories: ["labor"] }
];

export const UNIT_LABELS: Record<QuoteUnit, string> = {
  per_head: "Per Head",
  by_tray: "By Tray",
  flat: "Flat Rate",
  per_piece: "Per Piece",
  tiered_per_head: "Package"
};

export const UNIT_SHORT: Record<QuoteUnit, string> = {
  per_head: "per head",
  by_tray: "by tray",
  flat: "flat",
  per_piece: "per piece",
  tiered_per_head: "per person"
};
