import React from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer
} from "@react-pdf/renderer";

import { formatEventServiceLabel, legacyEventToServiceFields } from "./event-customer-types";
import { baseSlotLabel, expandPackageSlotLabels, type MenuPreferenceRow } from "./menu-preferences";
import {
  formatKitchenTrayLabel,
  lookupKitchenQty
} from "./package-kitchen-qty";
import {
  categoriesWithItems,
  formatPdfDate,
  formatPdfEventTime,
  getCategoryDisplayName,
  groupLineItemsByCategory,
  guestDisplayName,
  eventLocationDisplay,
  kitchenPortionLabel,
  packageIncludeSummary,
  PDF_NAVY
} from "./pdf-shared";
import type { QuoteWithRelations } from "./quote-serialize";

export type KitchenSheetInput = {
  quote: QuoteWithRelations;
  menuPreferences: MenuPreferenceRow[];
};

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 12,
    fontFamily: "Helvetica",
    color: "#111111"
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 20,
    borderBottomWidth: 3,
    borderBottomColor: PDF_NAVY,
    paddingBottom: 10
  },
  logo: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    color: PDF_NAVY
  },
  title: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: PDF_NAVY,
    letterSpacing: 1
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: PDF_NAVY,
    marginBottom: 8,
    marginTop: 18,
    textTransform: "uppercase"
  },
  detailRow: {
    flexDirection: "row",
    marginBottom: 5,
    fontSize: 12
  },
  detailLabel: {
    width: 110,
    fontFamily: "Helvetica-Bold"
  },
  detailValue: {
    flex: 1
  },
  block: {
    marginBottom: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#cccccc"
  },
  blockTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    marginBottom: 4
  },
  blockMeta: {
    fontSize: 11,
    color: "#333333",
    marginBottom: 4
  },
  prefRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
    fontSize: 11
  },
  categoryHeader: {
    backgroundColor: "#eef1f6",
    paddingVertical: 6,
    paddingHorizontal: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    color: PDF_NAVY,
    marginTop: 6
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee"
  },
  notesBox: {
    marginTop: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#cccccc",
    fontSize: 11,
    minHeight: 48
  },
  handlerBox: {
    marginTop: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#cccccc",
    fontSize: 11
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    textAlign: "center",
    fontSize: 10,
    color: "#666666"
  }
});

function resolvePackageLineItems(quote: QuoteWithRelations) {
  const tiered = quote.lineItems.filter((item) => item.unitType === "tiered_per_head");
  if (tiered.length === 0) return [];
  if (tiered.length === 1) return tiered;
  const linked = tiered.filter((item) => item.packageId);
  const pool = linked.length > 0 ? linked : tiered;
  return [pool[pool.length - 1]!];
}

function sortMenuPreferences(
  preferences: MenuPreferenceRow[],
  packageItems: { label: string; quantity: number }[] | undefined
): MenuPreferenceRow[] {
  if (!packageItems?.length) {
    return [...preferences].sort((a, b) => a.slotLabel.localeCompare(b.slotLabel));
  }
  const slotOrder = expandPackageSlotLabels(packageItems);
  const orderMap = new Map(slotOrder.map((slot, index) => [slot, index]));
  return [...preferences].sort(
    (a, b) => (orderMap.get(a.slotLabel) ?? 999) - (orderMap.get(b.slotLabel) ?? 999)
  );
}

function extractKitchenNotes(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const withoutActivity = raw.split("\n\n__TRIPE_ACTIVITY_JSON__")[0] ?? raw;
  const additional = withoutActivity.match(/(?:^|\n)Additional notes:\s*([\s\S]*)$/im)?.[1]?.trim();
  if (additional) return additional;
  return withoutActivity.trim();
}

/** Skip orphaned $0 food lines; keep equipment/delivery/labor. */
function filterKitchenAdditionalItems(
  lineItems: QuoteWithRelations["lineItems"]
): QuoteWithRelations["lineItems"] {
  return lineItems.filter((item) => {
    const price = Number(item.unitPrice);
    if (price === 0) {
      return (
        item.category === "equipment" ||
        item.category === "delivery" ||
        item.category === "labor"
      );
    }
    return true;
  });
}

function formatServiceLabel(quote: QuoteWithRelations): string {
  const event = quote.event;
  if (!event) return "—";
  const serviceType =
    event.serviceType ?? legacyEventToServiceFields(event.eventType).serviceType;
  const orderMode = event.orderMode ?? legacyEventToServiceFields(event.eventType).orderMode;
  return formatEventServiceLabel(serviceType, orderMode);
}

export function buildKitchenSheetPdfDocument(input: KitchenSheetInput): React.ReactElement {
  const { quote, menuPreferences } = input;
  const guestCount = quote.event?.guestCountEstimate ?? 0;
  const packages = resolvePackageLineItems(quote);
  const packageItem = packages[0];
  const packageItems = packageItem?.package?.items ?? [];
  const kitchenMatrix = packageItem?.package?.kitchenQtys ?? [];
  const sortedPrefs = sortMenuPreferences(menuPreferences, packageItems);
  const prefGroups = (() => {
    const groups: { label: string; items: { name: string; portion: string }[] }[] = [];
    const indexByLabel = new Map<string, number>();
    for (const pref of sortedPrefs) {
      if (!pref.selectedItem?.trim()) continue;
      const label = baseSlotLabel(pref.slotLabel);
      const trays = lookupKitchenQty(kitchenMatrix, label, guestCount);
      const portion =
        trays != null
          ? formatKitchenTrayLabel(trays)
          : kitchenPortionLabel(guestCount, "per_head", 1);
      const existingIdx = indexByLabel.get(label);
      if (existingIdx != null) {
        groups[existingIdx]!.items.push({ name: pref.selectedItem.trim(), portion });
      } else {
        indexByLabel.set(label, groups.length);
        groups.push({
          label,
          items: [{ name: pref.selectedItem.trim(), portion }]
        });
      }
    }
    return groups;
  })();
  const extraItems = filterKitchenAdditionalItems(
    quote.lineItems.filter((item) => item.unitType !== "tiered_per_head")
  );
  const itemsByCategory = groupLineItemsByCategory(extraItems);
  const deliveryItems = extraItems.filter((item) => item.category === "delivery");
  const laborItems = extraItems.filter((item) => item.category === "labor");
  const nonDeliveryItems = new Map<string, QuoteWithRelations["lineItems"]>();
  for (const [cat, items] of itemsByCategory.entries()) {
    if (cat === "delivery" || cat === "labor") continue;
    nonDeliveryItems.set(cat, items);
  }

  const packageBlocks = packages.map((item) =>
    React.createElement(
      View,
      { key: item.id, style: styles.block },
      React.createElement(Text, { style: styles.blockTitle }, item.name),
      React.createElement(
        Text,
        { style: styles.blockMeta },
        `${guestCount} guests · ${formatServiceLabel(quote)}`
      ),
      React.createElement(
        Text,
        { style: styles.blockMeta },
        `Included: ${packageIncludeSummary(item.package?.items ?? [])}`
      )
    )
  );

  const preferenceRows =
    prefGroups.length > 0
      ? prefGroups.flatMap((group) => [
          React.createElement(
            View,
            { key: `pref-cat-${group.label}`, style: styles.categoryHeader },
            React.createElement(
              Text,
              null,
              group.items.length > 1
                ? `${group.label.toUpperCase()} (×${group.items.length})`
                : group.label.toUpperCase()
            )
          ),
          ...group.items.map((item, idx) =>
            React.createElement(
              View,
              { key: `pref-${group.label}-${idx}`, style: styles.prefRow },
              React.createElement(Text, null, `• ${item.name}`),
              React.createElement(Text, null, item.portion)
            )
          )
        ])
      : [
          React.createElement(
            Text,
            { key: "prefs-empty", style: styles.blockMeta },
            "No menu preferences saved yet."
          )
        ];

  const packageMenuTitle =
    packageItem?.name != null
      ? `${packageItem.name.toUpperCase()} — SELECTED MENU`
      : "Menu Preferences";

  const additionalRows = categoriesWithItems(nonDeliveryItems).flatMap((cat) => {
    const items = nonDeliveryItems.get(cat) ?? [];
    if (items.length === 0) return [];
    return [
      React.createElement(
        View,
        { key: `cat-${cat}`, style: styles.categoryHeader },
        React.createElement(Text, null, getCategoryDisplayName(cat))
      ),
      ...items.map((item) =>
        React.createElement(
          View,
          { key: item.id, style: styles.itemRow },
          React.createElement(Text, null, item.name),
          React.createElement(
            Text,
            null,
            kitchenPortionLabel(guestCount, item.unitType, item.quantity, item.category)
          )
        )
      )
    ];
  });

  const staffingRows =
    laborItems.length > 0
      ? laborItems.map((item) =>
          React.createElement(
            View,
            { key: item.id, style: styles.itemRow },
            React.createElement(Text, null, item.name),
            React.createElement(
              Text,
              null,
              kitchenPortionLabel(guestCount, item.unitType, item.quantity, "labor")
            )
          )
        )
      : [
          React.createElement(Text, { key: "staff-empty", style: styles.blockMeta }, "—")
        ];

  const deliveryRows =
    deliveryItems.length > 0
      ? deliveryItems.map((item) =>
          React.createElement(
            View,
            { key: item.id, style: styles.itemRow },
            React.createElement(Text, null, item.name),
            React.createElement(Text, null, item.notes?.trim() || "—")
          )
        )
      : [
          React.createElement(Text, { key: "delivery-empty", style: styles.blockMeta }, "—")
        ];

  const kitchenNotes = extractKitchenNotes(quote.event?.notes ?? quote.notes);

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        View,
        { style: styles.headerRow },
        React.createElement(Text, { style: styles.logo }, "Tripeseats"),
        React.createElement(Text, { style: styles.title }, "KITCHEN SHEET")
      ),
      React.createElement(Text, { style: styles.sectionTitle }, "Event Information"),
      React.createElement(
        View,
        null,
        React.createElement(
          View,
          { style: styles.detailRow },
          React.createElement(Text, { style: styles.detailLabel }, "Guest:"),
          React.createElement(Text, { style: styles.detailValue }, guestDisplayName(quote))
        ),
        React.createElement(
          View,
          { style: styles.detailRow },
          React.createElement(Text, { style: styles.detailLabel }, "Event Date:"),
          React.createElement(
            Text,
            { style: styles.detailValue },
            formatPdfDate(quote.event?.eventDate)
          )
        ),
        React.createElement(
          View,
          { style: styles.detailRow },
          React.createElement(Text, { style: styles.detailLabel }, "Event Time:"),
          React.createElement(
            Text,
            { style: { ...styles.detailValue, fontFamily: "Helvetica-Bold", fontSize: 13 } },
            formatPdfEventTime(quote.event ?? undefined)
          )
        ),
        React.createElement(
          View,
          { style: styles.detailRow },
          React.createElement(Text, { style: styles.detailLabel }, "Guests:"),
          React.createElement(Text, { style: styles.detailValue }, String(guestCount))
        ),
        React.createElement(
          View,
          { style: styles.detailRow },
          React.createElement(Text, { style: styles.detailLabel }, "Location:"),
          React.createElement(Text, { style: styles.detailValue }, eventLocationDisplay(quote))
        ),
        React.createElement(
          View,
          { style: styles.detailRow },
          React.createElement(Text, { style: styles.detailLabel }, "Service:"),
          React.createElement(Text, { style: styles.detailValue }, formatServiceLabel(quote))
        )
      ),
      packages.length > 0
        ? React.createElement(Text, { style: styles.sectionTitle }, "Packages Selected")
        : null,
      ...packageBlocks,
      React.createElement(Text, { style: styles.sectionTitle }, packageMenuTitle),
      ...preferenceRows,
      additionalRows.length > 0
        ? React.createElement(Text, { style: styles.sectionTitle }, "Additional Items")
        : null,
      ...additionalRows,
      React.createElement(Text, { style: styles.sectionTitle }, "Staffing Required"),
      ...staffingRows,
      React.createElement(Text, { style: styles.sectionTitle }, "Delivery"),
      ...deliveryRows,
      React.createElement(Text, { style: styles.sectionTitle }, "Food Handlers"),
      React.createElement(
        View,
        { style: styles.handlerBox },
        React.createElement(Text, null, "Assigned food handlers: _________________________________"),
        React.createElement(Text, { style: { marginTop: 8 } }, "_________________________________")
      ),
      React.createElement(Text, { style: styles.sectionTitle }, "Notes / Special Instructions"),
      React.createElement(
        View,
        { style: styles.notesBox },
        React.createElement(Text, null, kitchenNotes || "—")
      ),
      React.createElement(
        Text,
        { style: styles.footer },
        "Kitchen copy — quantities only, no pricing"
      )
    )
  );
}

export async function generateKitchenSheetPdfBuffer(input: KitchenSheetInput): Promise<Buffer> {
  try {
    const buffer = await renderToBuffer(buildKitchenSheetPdfDocument(input));
    return Buffer.from(buffer);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[kitchen-sheet] Generation failed:", {
        quoteId: input.quote.id,
        error: err instanceof Error ? err.message : err
      });
    }
    throw Object.assign(new Error("Kitchen sheet PDF generation failed"), {
      status: 500,
      originalError: err
    });
  }
}
