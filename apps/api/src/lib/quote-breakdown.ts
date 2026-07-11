import { lineItemTotal } from "./quote-totals";

const FOOD_CATEGORIES = new Set([
  "appetizer",
  "veg_gravy",
  "chicken_gravy",
  "mutton_gravy",
  "rice_chicken",
  "rice_mutton",
  "breads",
  "side_items",
  "bbq",
  "dessert",
  "beverages"
]);

export type QuoteLineItemLike = {
  category: string;
  name: string;
  unitPrice: number;
  quantity: number;
  unitType: string;
  appliedTier?: number | null;
};

export type QuoteBreakdown = {
  food: number;
  labor: number;
  delivery: number;
  equipment: number;
  serviceCharges: number;
  discount: number;
  tax: number;
  total: number;
};

export function breakdownQuoteLineItems(
  lineItems: QuoteLineItemLike[],
  taxRate: number,
  guestCount: number
): QuoteBreakdown {
  let food = 0;
  let labor = 0;
  let delivery = 0;
  let equipment = 0;
  let serviceCharges = 0;
  let discount = 0;

  for (const item of lineItems) {
    const total = lineItemTotal(item, guestCount);
    const nameLower = item.name.toLowerCase();

    if (total < 0 || nameLower.includes("discount")) {
      discount += Math.abs(total);
      continue;
    }

    if (item.category === "delivery") {
      delivery += total;
    } else if (item.category === "equipment") {
      equipment += total;
    } else if (item.category === "labor") {
      labor += total;
    } else if (FOOD_CATEGORIES.has(item.category)) {
      food += total;
    } else if (item.category === "other") {
      if (nameLower.includes("labor")) {
        labor += total;
      } else if (nameLower.includes("service")) {
        serviceCharges += total;
      } else {
        food += total;
      }
    }
  }

  const subtotal = food + labor + delivery + equipment + serviceCharges - discount;
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  return { food, labor, delivery, equipment, serviceCharges, discount, tax, total };
}
