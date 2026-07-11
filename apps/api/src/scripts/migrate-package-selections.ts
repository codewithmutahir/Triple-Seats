/**
 * Migrates quotes.packageSelections JSONB → menu_preferences rows.
 * Run: pnpm migrate:prefs
 */
import { config } from "dotenv";
import { resolve } from "node:path";

import type { Prisma } from "@tripeseats/database";

config({ path: resolve(process.cwd(), "apps/api/.env") });

const PACKAGE_LABEL_TO_CATEGORY: Record<string, string> = {
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

function baseSlotLabel(slotLabel: string): string {
  const match = slotLabel.match(/^(.+?) Slot \d+$/);
  return match?.[1] ?? slotLabel;
}

type SelectionEntry = { id: string; name: string };
type PackageSelections = Record<string, Record<string, SelectionEntry[]>>;

function parseSelections(value: Prisma.JsonValue): PackageSelections | null {
  if (value === null || value === undefined) return {};
  if (typeof value !== "object" || Array.isArray(value)) return null;
  return value as PackageSelections;
}

async function main() {
  const { prisma } = await import("@tripeseats/database");

  const quotes = await prisma.quote.findMany({
    include: {
      lineItems: {
        where: { unitType: "tiered_per_head" },
        select: { packageId: true },
        take: 1
      }
    }
  });

  const quotesWithSelections = quotes.filter(
    (q) => q.packageSelections != null && typeof q.packageSelections === "object"
  );

  let migratedQuotes = 0;
  let migratedPrefs = 0;

  for (const quote of quotesWithSelections) {
    const parsed = parseSelections(quote.packageSelections);
    if (!parsed || Object.keys(parsed).length === 0) continue;

    const packageId = quote.lineItems[0]?.packageId;
    if (!packageId) continue;

    for (const byLabel of Object.values(parsed)) {
      for (const [label, entries] of Object.entries(byLabel ?? {})) {
        if (!Array.isArray(entries)) continue;
        entries.forEach((entry, index) => {
          if (!entry?.name) return;
          const slotLabel =
            entries.length > 1 && !label.match(/ Slot \d+$/)
              ? `${label} Slot ${index + 1}`
              : label;
          void slotLabel;
        });

        let slotIndex = 0;
        for (const entry of entries) {
          if (!entry?.name) continue;
          slotIndex += 1;
          const slotLabel =
            entries.length > 1 ? `${label} Slot ${slotIndex}` : label;

          try {
            await prisma.menuPreference.upsert({
              where: {
                eventId_slotLabel: {
                  eventId: quote.eventId,
                  slotLabel
                }
              },
              create: {
                eventId: quote.eventId,
                packageId,
                slotLabel,
                selectedItem: entry.name
              },
              update: {}
            });
            migratedPrefs += 1;
          } catch {
            // skip invalid rows
          }
        }
      }
    }
    migratedQuotes += 1;
  }

  console.log(`Migrated ${migratedQuotes} quotes, ${migratedPrefs} preferences`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
