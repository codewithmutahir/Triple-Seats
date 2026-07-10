import { prisma } from "@tripeseats/database";

type ItemCategory =
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
  | "other";

const DEFAULT_ITEMS: Record<
  ItemCategory,
  { name: string; defaultPrice: number; defaultUnit: "per_head" | "by_tray" | "flat" }[]
> = {
  appetizer: [
    { name: "Dahi Bara", defaultPrice: 55, defaultUnit: "per_head" },
    { name: "Chana Chat", defaultPrice: 45, defaultUnit: "per_head" },
    { name: "Rolls", defaultPrice: 8, defaultUnit: "by_tray" },
    { name: "Samosa", defaultPrice: 5, defaultUnit: "by_tray" },
    { name: "Spring Rolls", defaultPrice: 6, defaultUnit: "by_tray" },
    { name: "Chicken Patties", defaultPrice: 7, defaultUnit: "by_tray" },
    { name: "Fruit Chaat", defaultPrice: 4, defaultUnit: "per_head" }
  ],
  veg_gravy: [
    { name: "Shahi Paneer", defaultPrice: 12, defaultUnit: "per_head" },
    { name: "Kadai Paneer", defaultPrice: 12, defaultUnit: "per_head" },
    { name: "Paneer Butter Masala", defaultPrice: 14, defaultUnit: "per_head" },
    { name: "Palak Paneer", defaultPrice: 11, defaultUnit: "per_head" },
    { name: "Matar Paneer", defaultPrice: 10, defaultUnit: "per_head" },
    { name: "Malai Kofta", defaultPrice: 13, defaultUnit: "per_head" },
    { name: "Mix Vegetable Curry", defaultPrice: 9, defaultUnit: "per_head" },
    { name: "Navratan Korma", defaultPrice: 14, defaultUnit: "per_head" },
    { name: "Chana Masala", defaultPrice: 8, defaultUnit: "per_head" },
    { name: "Dal Makhani", defaultPrice: 9, defaultUnit: "per_head" },
    { name: "Dal Tadka", defaultPrice: 7, defaultUnit: "per_head" },
    { name: "Yellow Dal Fry", defaultPrice: 7, defaultUnit: "per_head" }
  ],
  chicken_gravy: [
    { name: "Butter Chicken", defaultPrice: 18, defaultUnit: "per_head" },
    { name: "Chicken Handi", defaultPrice: 16, defaultUnit: "per_head" },
    { name: "Chicken Karahi", defaultPrice: 17, defaultUnit: "per_head" },
    { name: "Chicken Korma", defaultPrice: 16, defaultUnit: "per_head" },
    { name: "Chicken White Karahi", defaultPrice: 17, defaultUnit: "per_head" },
    { name: "Chicken Achari", defaultPrice: 15, defaultUnit: "per_head" },
    { name: "Chicken Jalfrezi", defaultPrice: 15, defaultUnit: "per_head" },
    { name: "Chicken Tikka Masala", defaultPrice: 18, defaultUnit: "per_head" },
    { name: "Chicken Bhuna", defaultPrice: 14, defaultUnit: "per_head" },
    { name: "Chicken Lahori", defaultPrice: 15, defaultUnit: "per_head" },
    { name: "Chicken Haleem", defaultPrice: 13, defaultUnit: "per_head" },
    { name: "Chicken Nihari", defaultPrice: 16, defaultUnit: "per_head" }
  ],
  mutton_gravy: [
    { name: "Mutton Karahi", defaultPrice: 25, defaultUnit: "per_head" },
    { name: "Mutton Handi", defaultPrice: 24, defaultUnit: "per_head" },
    { name: "Mutton Korma", defaultPrice: 23, defaultUnit: "per_head" },
    { name: "Mutton Curry", defaultPrice: 20, defaultUnit: "per_head" },
    { name: "Mutton Rogan Josh", defaultPrice: 26, defaultUnit: "per_head" },
    { name: "Mutton Bhuna", defaultPrice: 22, defaultUnit: "per_head" },
    { name: "Mutton White Karahi", defaultPrice: 25, defaultUnit: "per_head" },
    { name: "Mutton Nihari", defaultPrice: 24, defaultUnit: "per_head" },
    { name: "Mutton Paya", defaultPrice: 22, defaultUnit: "per_head" },
    { name: "Mutton Haleem", defaultPrice: 20, defaultUnit: "per_head" }
  ],
  rice_chicken: [
    { name: "Chicken Biryani", defaultPrice: 18, defaultUnit: "per_head" },
    { name: "Chicken Dum Biryani", defaultPrice: 20, defaultUnit: "per_head" },
    { name: "Chicken Pulao", defaultPrice: 16, defaultUnit: "per_head" },
    { name: "Chicken Yakhni Pulao", defaultPrice: 17, defaultUnit: "per_head" },
    { name: "Chicken Tikka Biryani", defaultPrice: 22, defaultUnit: "per_head" },
    { name: "Chicken Mandi", defaultPrice: 24, defaultUnit: "per_head" }
  ],
  rice_mutton: [
    { name: "Mutton Biryani", defaultPrice: 26, defaultUnit: "per_head" },
    { name: "Mutton Dum Biryani", defaultPrice: 28, defaultUnit: "per_head" },
    { name: "Mutton Pulao", defaultPrice: 24, defaultUnit: "per_head" },
    { name: "Mutton Yakhni Pulao", defaultPrice: 25, defaultUnit: "per_head" },
    { name: "Mutton Mandi", defaultPrice: 30, defaultUnit: "per_head" }
  ],
  breads: [
    { name: "Plain Naan", defaultPrice: 2, defaultUnit: "per_head" },
    { name: "Butter Naan", defaultPrice: 3, defaultUnit: "per_head" },
    { name: "Garlic Naan", defaultPrice: 3, defaultUnit: "per_head" },
    { name: "Roghni Naan", defaultPrice: 3, defaultUnit: "per_head" },
    { name: "Tandoori Roti", defaultPrice: 2, defaultUnit: "per_head" },
    { name: "Laccha Paratha", defaultPrice: 3, defaultUnit: "per_head" }
  ],
  side_items: [
    { name: "Green Salad", defaultPrice: 3, defaultUnit: "per_head" },
    { name: "Russian Salad", defaultPrice: 4, defaultUnit: "per_head" },
    { name: "Mint Raita", defaultPrice: 2, defaultUnit: "per_head" },
    { name: "Boondi Raita", defaultPrice: 2, defaultUnit: "per_head" },
    { name: "Plain Yogurt", defaultPrice: 2, defaultUnit: "per_head" },
    { name: "Pickle", defaultPrice: 1, defaultUnit: "per_head" },
    { name: "Chutney", defaultPrice: 1, defaultUnit: "per_head" }
  ],
  bbq: [
    { name: "Chicken Tikka", defaultPrice: 15, defaultUnit: "per_head" },
    { name: "Tikka Boti", defaultPrice: 15, defaultUnit: "per_head" },
    { name: "Malai Boti", defaultPrice: 18, defaultUnit: "per_head" },
    { name: "Afghani Boti", defaultPrice: 20, defaultUnit: "per_head" },
    { name: "Chicken Seekh Kabab", defaultPrice: 14, defaultUnit: "per_head" },
    { name: "Beef Seekh Kabab", defaultPrice: 16, defaultUnit: "per_head" },
    { name: "Reshmi Kabab", defaultPrice: 17, defaultUnit: "per_head" },
    { name: "Fish Tikka", defaultPrice: 20, defaultUnit: "per_head" }
  ],
  dessert: [
    { name: "Kheer", defaultPrice: 8, defaultUnit: "per_head" },
    { name: "Trifle", defaultPrice: 10, defaultUnit: "per_head" },
    { name: "Pudding", defaultPrice: 9, defaultUnit: "per_head" },
    { name: "Faloda", defaultPrice: 12, defaultUnit: "per_head" },
    { name: "Gulab Jamun", defaultPrice: 6, defaultUnit: "per_head" },
    { name: "Ras Malai", defaultPrice: 8, defaultUnit: "per_head" },
    { name: "Shahi Tukda", defaultPrice: 9, defaultUnit: "per_head" },
    { name: "Gajar Ka Halwa", defaultPrice: 7, defaultUnit: "per_head" },
    { name: "Firni", defaultPrice: 7, defaultUnit: "per_head" },
    { name: "Ice Cream", defaultPrice: 5, defaultUnit: "per_head" }
  ],
  beverages: [
    { name: "Soft Drinks", defaultPrice: 3, defaultUnit: "per_head" },
    { name: "Mineral Water", defaultPrice: 1, defaultUnit: "per_head" },
    { name: "Fresh Lime", defaultPrice: 3, defaultUnit: "per_head" },
    { name: "Mint Margarita", defaultPrice: 4, defaultUnit: "per_head" },
    { name: "Lassi", defaultPrice: 4, defaultUnit: "per_head" },
    { name: "Tea", defaultPrice: 2, defaultUnit: "per_head" },
    { name: "Coffee", defaultPrice: 3, defaultUnit: "per_head" },
    { name: "Juice", defaultPrice: 4, defaultUnit: "per_head" }
  ],
  equipment: [
    { name: "Plates", defaultPrice: 2, defaultUnit: "flat" },
    { name: "Dishes", defaultPrice: 3, defaultUnit: "flat" },
    { name: "Tongs", defaultPrice: 1, defaultUnit: "flat" },
    { name: "Bowls", defaultPrice: 2, defaultUnit: "flat" },
    { name: "Chargers", defaultPrice: 5, defaultUnit: "flat" },
    { name: "Cutlery", defaultPrice: 3, defaultUnit: "flat" }
  ],
  delivery: [],
  other: []
};

export async function seedMenuItemsForCaterer(catererId: string) {
  for (const [category, items] of Object.entries(DEFAULT_ITEMS)) {
    await ensureDefaultItemsForCategory(catererId, category as ItemCategory);
  }
}

/** Inserts any default catalog items missing for this caterer + category (one fast query). */
export async function ensureDefaultItemsForCategory(catererId: string, category: ItemCategory) {
  const defaults = DEFAULT_ITEMS[category];
  if (!defaults.length) return;

  const existing = await prisma.menuItem.findMany({
    where: { catererId, category },
    select: { name: true }
  });
  const existingNames = new Set(existing.map((e) => e.name.toLowerCase()));

  const missing = defaults.filter((item) => !existingNames.has(item.name.toLowerCase()));
  if (missing.length === 0) return;

  await prisma.menuItem.createMany({
    data: missing.map((item) => ({
      catererId,
      category,
      name: item.name,
      defaultPrice: item.defaultPrice,
      defaultUnit: item.defaultUnit,
      isDefault: true
    })),
    skipDuplicates: true
  });
}

/** @deprecated Use ensureDefaultItemsForCategory per request */
export async function ensureMenuItemsForCaterer(catererId: string) {
  await seedMenuItemsForCaterer(catererId);
}

export function defaultItemCountForCategory(category: ItemCategory): number {
  return DEFAULT_ITEMS[category]?.length ?? 0;
}
