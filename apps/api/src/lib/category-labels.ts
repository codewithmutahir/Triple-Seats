export const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  appetizer: "Appetizer",
  veg_gravy: "Veg Gravy",
  chicken_gravy: "Chicken Gravy",
  mutton_gravy: "Mutton Gravy",
  rice_chicken: "Rice & Chicken",
  rice_mutton: "Rice & Mutton",
  breads: "Breads",
  side_items: "Side Items",
  bbq: "BBQ",
  dessert: "Dessert",
  beverages: "Beverages",
  equipment: "Equipment",
  delivery: "Delivery",
  labor: "Labor & Staffing",
  other: "Other"
};

export function getCategoryLabel(cat: string): string {
  return (
    CATEGORY_DISPLAY_NAMES[cat] ??
    cat.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
  );
}
