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
  Bread: "breads",
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

/**
 * After package select/change: remove prefs for removed slots, seed new slots with defaults.
 * skipDuplicates preserves caterer choices on overlapping slots.
 * Batched to avoid N+1 round-trips to remote Postgres.
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

  // Keep dish choices on overlapping slots, but bind them to the active package
  // so kitchen-sheet filters never mix packages.
  if (newSlots.length > 0) {
    await prisma.menuPreference.updateMany({
      where: { eventId, slotLabel: { in: newSlots } },
      data: { packageId }
    });
  }

  if (newSlots.length === 0) return;

  const categoriesNeeded = [
    ...new Set(
      newSlots
        .map((slot) => categoryForPackageLabel(baseSlotLabel(slot)))
        .filter((c): c is MenuItemCategory => Boolean(c))
    )
  ];

  if (categoriesNeeded.length === 0) return;

  const catalog = await prisma.menuItem.findMany({
    where: { catererId, category: { in: categoriesNeeded } },
    orderBy: [{ usageCount: "desc" }, { name: "asc" }],
    select: { category: true, name: true }
  });

  const defaultByCategory = new Map<string, string>();
  for (const item of catalog) {
    if (!defaultByCategory.has(item.category)) {
      defaultByCategory.set(item.category, item.name);
    }
  }

  const rows: { eventId: string; packageId: string; slotLabel: string; selectedItem: string }[] =
    [];
  for (const slotLabel of newSlots) {
    const category = categoryForPackageLabel(baseSlotLabel(slotLabel));
    if (!category) continue;
    const selectedItem = defaultByCategory.get(category);
    if (!selectedItem) continue;
    rows.push({ eventId, packageId, slotLabel, selectedItem });
  }

  if (rows.length === 0) return;

  await prisma.menuPreference.createMany({
    data: rows,
    skipDuplicates: true
  });
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

/** Clear all kitchen-sheet menu selections for an event (e.g. package removed). */
export async function clearMenuPreferencesForEvent(eventId: string): Promise<void> {
  await prisma.menuPreference.deleteMany({ where: { eventId } });
}

/**
 * Prefs used on the kitchen sheet must match the active package.
 * Leftover rows from a prior package selection are ignored.
 */
export function filterMenuPreferencesForPackage(
  preferences: MenuPreferenceRow[],
  packageId: string | null | undefined
): MenuPreferenceRow[] {
  if (!packageId) return [];
  return preferences.filter((pref) => pref.packageId === packageId);
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

/**
 * Replace preferences in 2 DB round-trips instead of N sequential upserts
 * (~7s → ~0.5s on remote Supabase).
 */
export async function saveMenuPreferences(
  eventId: string,
  packageId: string,
  preferences: { slotLabel: string; selectedItem: string }[]
): Promise<MenuPreferenceRow[]> {
  if (preferences.length === 0) {
    return loadMenuPreferencesForEvent(eventId);
  }

  const slotLabels = preferences.map((p) => p.slotLabel);

  await prisma.$transaction(async (tx) => {
    await tx.menuPreference.deleteMany({
      where: { eventId, slotLabel: { in: slotLabels } }
    });
    await tx.menuPreference.createMany({
      data: preferences.map((pref) => ({
        eventId,
        packageId,
        slotLabel: pref.slotLabel,
        selectedItem: pref.selectedItem
      }))
    });
  });

  // Avoid a third SELECT — caller only needs slotLabel + selectedItem
  return preferences.map((pref) => ({
    id: "",
    eventId,
    packageId,
    slotLabel: pref.slotLabel,
    selectedItem: pref.selectedItem,
    createdAt: new Date(),
    updatedAt: new Date()
  }));
}
