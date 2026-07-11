import { PACKAGE_ITEM_SECTIONS } from "@/lib/event-customer-types";
import type { ItemCategory } from "@/components/quote/types";

export function baseSlotLabel(slotLabel: string): string {
  const match = slotLabel.match(/^(.+?) Slot \d+$/);
  return match?.[1] ?? slotLabel;
}

export function expandPackageSlotLabels(
  items: { label: string; quantity: number }[]
): string[] {
  const slots: string[] = [];
  for (const item of items) {
    if (item.quantity <= 1) {
      slots.push(item.label);
    } else {
      for (let i = 1; i <= item.quantity; i++) {
        slots.push(`${item.label} Slot ${i}`);
      }
    }
  }
  return slots;
}

export function categoryForSlotLabel(label: string): ItemCategory | null {
  return PACKAGE_ITEM_SECTIONS[label] ?? null;
}
