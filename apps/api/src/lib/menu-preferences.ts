import { prisma } from "@tripeseats/database";

type MenuItemCategory =
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

/** Maps package included item labels to menu item categories. */
const PACKAGE_LABEL_TO_CATEGORY: Record<string, MenuItemCategory> = {
  Appetizer: "appetizer",
  "Veg Gravy": "veg_gravy",
  "Chicken Gravy": "chicken_gravy",
  "Mutton Gravy": "mutton_gravy",
  "Rice Chicken": "rice_chicken",
  "Rice Mutton": "rice_mutton",
  Grill: "bbq",
  BBQ: "bbq",
  Dessert: "dessert",
  Naan: "breads",
  Salad: "side_items",
  Raita: "side_items",
  "Mirchi Ka Salan": "side_items",
  Beverages: "beverages"
};

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

function categoryForPackageLabel(label: string): MenuItemCategory | null {
  return PACKAGE_LABEL_TO_CATEGORY[label] ?? null;
}

async function defaultMenuItemName(
  catererId: string,
  category: MenuItemCategory
): Promise<string | null> {
  const item = await prisma.menuItem.findFirst({
    where: { catererId, category },
    orderBy: [{ usageCount: "desc" }, { name: "asc" }],
    select: { name: true }
  });
  return item?.name ?? null;
}

/**
 * After package select/change: remove prefs for removed slots, seed new slots with defaults.
 * ON CONFLICT (eventId, slotLabel) DO NOTHING — preserves caterer choices on overlapping slots.
 */
export async function syncMenuPreferencesForPackage(
  eventId: string,
  packageId: string,
  catererId: string,
  pkgItems: { label: string; quantity: number }[]
): Promise<void> {
  const newSlots = expandPackageSlotLabels(pkgItems);
  const newSlotSet = new Set(newSlots);

  await prisma.menuPreference.deleteMany({
    where: {
      eventId,
      slotLabel: { notIn: [...newSlotSet] }
    }
  });

  for (const slotLabel of newSlots) {
    const baseLabel = baseSlotLabel(slotLabel);
    const category = categoryForPackageLabel(baseLabel);
    if (!category) continue;

    const selectedItem = await defaultMenuItemName(catererId, category);
    if (!selectedItem) continue;

    await prisma.menuPreference.upsert({
      where: {
        eventId_slotLabel: { eventId, slotLabel }
      },
      create: {
        eventId,
        packageId,
        slotLabel,
        selectedItem
      },
      update: {}
    });
  }
}

export type MenuPreferenceRow = {
  id: string;
  eventId: string;
  packageId: string;
  slotLabel: string;
  selectedItem: string;
  createdAt: Date;
  updatedAt: Date;
};

export async function loadMenuPreferencesForEvent(
  eventId: string
): Promise<MenuPreferenceRow[]> {
  return prisma.menuPreference.findMany({
    where: { eventId },
    orderBy: { slotLabel: "asc" }
  });
}

export function parseMenuPreferencesPatch(body: unknown):
  | { slotLabel: string; selectedItem: string }[]
  | null {
  if (!body || typeof body !== "object") return null;
  const preferences = (body as { preferences?: unknown }).preferences;
  if (!Array.isArray(preferences)) return null;

  const result: { slotLabel: string; selectedItem: string }[] = [];
  for (const entry of preferences) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { slotLabel?: unknown }).slotLabel !== "string" ||
      typeof (entry as { selectedItem?: unknown }).selectedItem !== "string"
    ) {
      return null;
    }
    const slotLabel = (entry as { slotLabel: string }).slotLabel.trim();
    const selectedItem = (entry as { selectedItem: string }).selectedItem.trim();
    if (!slotLabel || !selectedItem) return null;
    result.push({ slotLabel, selectedItem });
  }
  return result;
}

export async function saveMenuPreferences(
  eventId: string,
  packageId: string,
  preferences: { slotLabel: string; selectedItem: string }[]
): Promise<MenuPreferenceRow[]> {
  await prisma.$transaction(
    preferences.map((pref) =>
      prisma.menuPreference.upsert({
        where: {
          eventId_slotLabel: { eventId, slotLabel: pref.slotLabel }
        },
        create: {
          eventId,
          packageId,
          slotLabel: pref.slotLabel,
          selectedItem: pref.selectedItem
        },
        update: {
          packageId,
          selectedItem: pref.selectedItem
        }
      })
    )
  );

  return loadMenuPreferencesForEvent(eventId);
}
