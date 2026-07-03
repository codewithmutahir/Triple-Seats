export const EVENT_TYPE_VALUES = [
  "delivery",
  "pickup",
  "order_by_tray",
  "full_service"
] as const;

export type EventTypeValue = (typeof EVENT_TYPE_VALUES)[number];

export const EVENT_TYPE_LABELS: Record<EventTypeValue, string> = {
  delivery: "Delivery",
  pickup: "Pickup",
  order_by_tray: "Order by Tray",
  full_service: "Full Service"
};

export const CUSTOMER_TYPE_VALUES = ["b2b", "b2c"] as const;

export type CustomerTypeValue = (typeof CUSTOMER_TYPE_VALUES)[number];

export const CUSTOMER_TYPE_LABELS: Record<CustomerTypeValue, string> = {
  b2b: "B2B",
  b2c: "B2C"
};

export function formatEventType(value: string): string {
  return EVENT_TYPE_LABELS[value as EventTypeValue] ?? value;
}

export function formatCustomerType(value: string): string {
  return CUSTOMER_TYPE_LABELS[value as CustomerTypeValue] ?? value.toUpperCase();
}

/** Maps package included item labels to quote menu sections. */
export const PACKAGE_ITEM_SECTIONS: Record<string, "appetizer" | "main_course" | "bbq" | "dessert"> = {
  Appetizer: "appetizer",
  "Veg Gravy": "main_course",
  "Chicken Gravy": "main_course",
  "Mutton Gravy": "main_course",
  "Rice Chicken": "main_course",
  Grill: "bbq",
  Dessert: "dessert",
  Naan: "main_course",
  Salad: "main_course",
  Raita: "main_course",
  "Mirchi Ka Salan": "main_course"
};
