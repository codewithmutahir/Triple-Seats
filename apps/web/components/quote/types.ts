export type ItemCategory =
  | "appetizer"
  | "main_course"
  | "bbq"
  | "dessert"
  | "equipment"
  | "delivery"
  | "other";

export type QuoteUnit = "per_head" | "by_tray" | "flat" | "per_piece" | "tiered_per_head";

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined";

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
  lineItems: QuoteLineItem[];
  event?: QuoteEvent;
};

export type SaveStatus = "idle" | "saving" | "saved" | "error";

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
    category: "main_course",
    label: "Main Course",
    borderClass: "border-l-blue-500",
    emptyMessage: "No main courses yet — add from suggestions above"
  },
  {
    category: "bbq",
    label: "BBQ",
    borderClass: "border-l-red-500",
    emptyMessage: "No BBQ items yet — add from suggestions above"
  },
  {
    category: "dessert",
    label: "Dessert",
    borderClass: "border-l-pink-500",
    emptyMessage: "No desserts yet — add from suggestions above"
  },
  {
    category: "equipment",
    label: "Equipment",
    borderClass: "border-l-gray-400",
    emptyMessage: "No equipment yet — add from suggestions above"
  }
];

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  appetizer: "APPETIZER",
  main_course: "MAIN COURSE",
  bbq: "BBQ",
  dessert: "DESSERT",
  equipment: "EQUIPMENT",
  delivery: "DELIVERY",
  other: "OTHER"
};

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
