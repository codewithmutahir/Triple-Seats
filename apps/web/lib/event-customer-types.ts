import type { ItemCategory } from "@/components/quote/types";

export const EVENT_TYPE_VALUES = [
  "delivery",
  "pickup",
  "order_by_tray",
  "full_service",
] as const;

export type EventTypeValue = (typeof EVENT_TYPE_VALUES)[number];

export const SERVICE_TYPE_VALUES = ["full_service", "order_by_tray"] as const;
export type ServiceTypeValue = (typeof SERVICE_TYPE_VALUES)[number];

export const ORDER_MODE_VALUES = ["delivery", "pickup"] as const;
export type OrderModeValue = (typeof ORDER_MODE_VALUES)[number];

export const EVENT_TYPE_LABELS: Record<EventTypeValue, string> = {
  delivery: "Catering By tray Delivery",
  pickup: "Catering By tray Pickup",
  order_by_tray: "Catering per Head",
  full_service: "Full Service Catering (Food + Setup)",
};

export const SERVICE_TYPE_LABELS: Record<ServiceTypeValue, string> = {
  full_service: "Full Service Catering (Food + Setup)",
  order_by_tray: "Catering per Head",
};

export const ORDER_MODE_LABELS: Record<OrderModeValue, string> = {
  delivery: "Delivery",
  pickup: "Pickup",
};

export const CUSTOMER_TYPE_VALUES = ["b2b", "b2c"] as const;

export type CustomerTypeValue = (typeof CUSTOMER_TYPE_VALUES)[number];

export const CUSTOMER_TYPE_LABELS: Record<CustomerTypeValue, string> = {
  b2b: "Banquet Halls",
  b2c: "Individual customer",
};

export function formatEventType(value: string): string {
  return EVENT_TYPE_LABELS[value as EventTypeValue] ?? value;
}

export function formatServiceType(value: string): string {
  return SERVICE_TYPE_LABELS[value as ServiceTypeValue] ?? value;
}

export function formatOrderMode(value: string): string {
  return ORDER_MODE_LABELS[value as OrderModeValue] ?? value;
}

export function formatCustomerType(value: string): string {
  return (
    CUSTOMER_TYPE_LABELS[value as CustomerTypeValue] ?? value.toUpperCase()
  );
}

export function formatEventServiceLabel(
  serviceType: ServiceTypeValue,
  orderMode: OrderModeValue,
): string {
  return `${formatServiceType(serviceType)} · ${formatOrderMode(orderMode)}`;
}

export function isServiceType(value: string): value is ServiceTypeValue {
  return (SERVICE_TYPE_VALUES as readonly string[]).includes(value);
}

export function isOrderMode(value: string): value is OrderModeValue {
  return (ORDER_MODE_VALUES as readonly string[]).includes(value);
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
  Bread: "breads",
  Salad: "side_items",
  Raita: "side_items",
  "Mirchi Ka Salan": "side_items",
  Beverages: "beverages",
};
