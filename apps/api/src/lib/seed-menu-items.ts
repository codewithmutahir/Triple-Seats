import { prisma } from "@tripeseats/database";

type ItemCategory =
  | "appetizer"
  | "main_course"
  | "bbq"
  | "dessert"
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
    { name: "Fruit Chat", defaultPrice: 50, defaultUnit: "per_head" },
    { name: "Russian Salad", defaultPrice: 60, defaultUnit: "per_head" },
    { name: "Macaroni Salad", defaultPrice: 55, defaultUnit: "per_head" },
    { name: "Spring Rolls", defaultPrice: 10, defaultUnit: "by_tray" },
    { name: "Chicken Rolls", defaultPrice: 12, defaultUnit: "by_tray" },
    { name: "Vegetable Rolls", defaultPrice: 9, defaultUnit: "by_tray" },
    { name: "Samosa", defaultPrice: 5, defaultUnit: "by_tray" },
    { name: "Chicken Samosa", defaultPrice: 8, defaultUnit: "by_tray" },
    { name: "Mini Patties", defaultPrice: 10, defaultUnit: "by_tray" },
    { name: "Chicken Patties", defaultPrice: 12, defaultUnit: "by_tray" },
    { name: "Chicken Nuggets", defaultPrice: 15, defaultUnit: "by_tray" },
    { name: "Chicken Wings", defaultPrice: 18, defaultUnit: "by_tray" },
    { name: "Shami Kabab", defaultPrice: 14, defaultUnit: "by_tray" },
    { name: "Seekh Kabab", defaultPrice: 16, defaultUnit: "by_tray" },
    { name: "Fish Fingers", defaultPrice: 18, defaultUnit: "by_tray" },
    { name: "French Fries", defaultPrice: 10, defaultUnit: "by_tray" },
    { name: "Cheese Balls", defaultPrice: 15, defaultUnit: "by_tray" },
    { name: "Mini Sandwiches", defaultPrice: 14, defaultUnit: "by_tray" }
  ],
  main_course: [
    { name: "Chicken Biryani", defaultPrice: 18, defaultUnit: "per_head" },
    { name: "Korma", defaultPrice: 22, defaultUnit: "per_head" },
    { name: "Pilao", defaultPrice: 16, defaultUnit: "per_head" },
    { name: "Karahi", defaultPrice: 25, defaultUnit: "per_head" }
  ],
  bbq: [
    { name: "Tikka Boti", defaultPrice: 15, defaultUnit: "per_head" },
    { name: "Malai Boti", defaultPrice: 18, defaultUnit: "per_head" },
    { name: "Afghani Boti", defaultPrice: 20, defaultUnit: "per_head" }
  ],
  dessert: [
    { name: "Kheer", defaultPrice: 8, defaultUnit: "per_head" },
    { name: "Trifle", defaultPrice: 10, defaultUnit: "per_head" },
    { name: "Pudding", defaultPrice: 9, defaultUnit: "per_head" },
    { name: "Faloda", defaultPrice: 12, defaultUnit: "per_head" }
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
