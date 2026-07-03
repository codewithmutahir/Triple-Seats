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

export function isEventType(value: string): value is EventTypeValue {
  return (EVENT_TYPE_VALUES as readonly string[]).includes(value);
}

export function isCustomerType(value: string): value is CustomerTypeValue {
  return (CUSTOMER_TYPE_VALUES as readonly string[]).includes(value);
}

export function formatEventType(value: string): string {
  return EVENT_TYPE_LABELS[value as EventTypeValue] ?? value;
}

export function eventTypeTitle(value: EventTypeValue): string {
  return EVENT_TYPE_LABELS[value];
}
