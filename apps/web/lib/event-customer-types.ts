import type { ItemCategory } from "@/components/quote/types";

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
export const PACKAGE_ITEM_SECTIONS: Record<string, ItemCategory> = {
  Appetizer: "appetizer",
  "Veg Gravy": "veg_gravy",
  "Chicken Gravy": "chicken_gravy",
  "Mutton Gravy": "mutton_gravy",
  "Rice Chicken": "rice_chicken",
  "Rice Mutton": "rice_mutton",
  Grill: "bbq",
  Dessert: "dessert",
  Naan: "breads",
  Salad: "side_items",
  Raita: "side_items",
  "Mirchi Ka Salan": "side_items",
  Beverages: "beverages"
};
