import type { Prisma } from "@tripeseats/database";
import React from "react";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer
} from "@react-pdf/renderer";

import { escapeHtml } from "./mail";
import {
  formatEventServiceLabel,
  legacyEventToServiceFields,
  type ServiceTypeValue
} from "./event-customer-types";
import {
  categoriesWithItems,
  formatPdfDate,
  formatPdfEventTime,
  formatPackageSelectedMenuSummary,
  getCategoryDisplayName,
  groupLineItemsByCategory,
  groupMenuPreferencesForDisplay,
  guestDisplayName,
  eventLocationDisplay,
  packageIncludeSummary,
  PDF_NAVY
} from "./pdf-shared";
import { QUOTE_TERMS_PARAGRAPHS, QUOTE_TERMS_TITLE } from "./quote-terms";
import {
  calculateQuoteTotals,
  formatTaxRatePercent,
  formatUsd,
  getActiveTier,
  lineItemTotal
} from "./quote-totals";
import type { QuoteWithRelations } from "./quote-serialize";
import { loadMenuPreferencesForEvent, type MenuPreferenceRow } from "./menu-preferences";

type Caterer = Prisma.CatererGetPayload<Record<string, never>>;
type PdfLineItem = QuoteWithRelations["lineItems"][number];
type PdfMenuPreference = Pick<MenuPreferenceRow, "slotLabel" | "selectedItem">;

const UNIT_LABELS: Record<string, string> = {
  per_head: "Per Head",
  by_tray: "By Tray",
  flat: "Flat Rate",
  per_piece: "Per Piece",
  tiered_per_head: "Package"
};

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1a1a1a"
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 24,
    borderBottomWidth: 2,
    borderBottomColor: PDF_NAVY,
    paddingBottom: 12
  },
  logo: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: PDF_NAVY
  },
  title: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: PDF_NAVY,
    letterSpacing: 1
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: PDF_NAVY,
    marginBottom: 8,
    marginTop: 16
  },
  detailRow: {
    flexDirection: "row",
    marginBottom: 4
  },
  detailLabel: {
    width: 90,
    fontFamily: "Helvetica-Bold",
    color: "#444"
  },
  detailValue: {
    flex: 1
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: PDF_NAVY,
    color: "#ffffff",
    paddingVertical: 6,
    paddingHorizontal: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 9
  },
  categoryHeader: {
    backgroundColor: "#eef1f6",
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: PDF_NAVY,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#ccc"
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#ccc",
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontSize: 9
  },
  colName: { width: "36%" },
  colQty: { width: "10%", textAlign: "right" },
  colUnit: { width: "18%" },
  colPrice: { width: "18%", textAlign: "right" },
  colTotal: { width: "18%", textAlign: "right" },
  colNameWide: { width: "55%" },
  colTotalWide: { width: "45%", textAlign: "right" },
  totalsBox: {
    marginTop: 20,
    marginLeft: "auto",
    width: 240,
    borderWidth: 1,
    borderColor: "#ccc"
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee"
  },
  totalsRowBold: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontFamily: "Helvetica-Bold",
    backgroundColor: "#eef1f6"
  },
  footer: {
    marginTop: 24,
    textAlign: "center",
    fontSize: 9,
    color: "#666",
    borderTopWidth: 1,
    borderTopColor: "#ccc",
    paddingTop: 10
  },
  packageBlock: {
    marginBottom: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 4
  },
  packageTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10,
    color: PDF_NAVY,
    marginBottom: 4
  },
  packageMeta: {
    fontSize: 9,
    color: "#444",
    marginBottom: 6
  },
  notesBox: {
    marginTop: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    fontSize: 9
  },
  termsBox: {
    marginTop: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#ccc"
  },
  termsText: {
    fontSize: 8,
    color: "#444",
    marginBottom: 5,
    lineHeight: 1.35
  }
});

function deduplicateLineItems(lineItems: PdfLineItem[]): PdfLineItem[] {
  const seen = new Map<string, PdfLineItem>();

  for (const item of lineItems) {
    const key = `${item.category}:${item.name}:${item.unitType}`;
    const existing = seen.get(key);
    if (existing) {
      seen.set(key, { ...existing, quantity: existing.quantity + item.quantity });
    } else {
      seen.set(key, { ...item });
    }
  }

  return Array.from(seen.values());
}

/**
 * Drop orphaned $0 food lines left after package removal.
 * Equipment / delivery / labor may legitimately be $0.
 * B2B quotes only allow package + equipment/delivery/labor as additional lines.
 */
function filterValidPdfAdditionalItems(
  lineItems: PdfLineItem[],
  customerType: "b2b" | "b2c" = "b2c"
): PdfLineItem[] {
  const alwaysShow = new Set(["equipment", "delivery", "labor"]);
  return lineItems.filter((item) => {
    if (item.unitType === "tiered_per_head") return true;
    if (customerType === "b2b" && !alwaysShow.has(item.category)) return false;
    const price = Number(item.unitPrice);
    if (price === 0) {
      return alwaysShow.has(item.category);
    }
    return true;
  });
}

function packageMenuLines(
  prefs: PdfMenuPreference[],
  packageItems: { label: string; quantity: number }[] | null | undefined
): string[] {
  const groups = groupMenuPreferencesForDisplay(prefs, packageItems);
  if (groups.length === 0) return [];
  return groups.map(({ label, items }) =>
    items.length > 1 ? `• ${label}: ${items.join(", ")}` : `• ${label}: ${items[0]}`
  );
}

function qtyDisplay(item: PdfLineItem, guestCount: number): string {
  const unitType =
    item.category === "equipment" && item.unitType === "per_head" ? "per_piece" : item.unitType;
  if (unitType === "per_head" || unitType === "tiered_per_head") {
    return String(Math.max(0, guestCount) * item.quantity);
  }
  return String(item.quantity);
}

function packageTierLabel(item: PdfLineItem): string {
  if (item.appliedTierLabel) return item.appliedTierLabel;
  if (item.notes) return item.notes;
  return `${formatUsd(item.unitPrice)}/person`;
}

function resolvePackageLineItems(quote: QuoteWithRelations) {
  const tiered = quote.lineItems.filter((item) => item.unitType === "tiered_per_head");
  if (tiered.length === 0) return [];
  if (tiered.length === 1) return tiered;

  const linked = tiered.filter((item) => item.packageId);
  const pool = linked.length > 0 ? linked : tiered;
  return [pool[pool.length - 1]!];
}

function resolveServiceType(quote: QuoteWithRelations): ServiceTypeValue {
  const event = quote.event;
  if (!event) return "full_service";
  return (
    (event.serviceType as ServiceTypeValue | null) ??
    legacyEventToServiceFields(event.eventType).serviceType
  );
}

function formatEventTypeLabel(quote: QuoteWithRelations): string {
  const event = quote.event;
  if (!event) return "—";
  const serviceType =
    (event.serviceType as ServiceTypeValue | null) ??
    legacyEventToServiceFields(event.eventType).serviceType;
  const orderMode =
    event.orderMode ?? legacyEventToServiceFields(event.eventType).orderMode;
  return formatEventServiceLabel(serviceType, orderMode);
}

function buildTrayLineItemRows(
  itemsByCategory: Map<string, PdfLineItem[]>,
  guestCount: number
) {
  return categoriesWithItems(itemsByCategory).flatMap((cat) => {
    const items = itemsByCategory.get(cat) ?? [];
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
          { key: item.id, style: styles.tableRow },
          React.createElement(Text, { style: styles.colName }, item.name),
          React.createElement(Text, { style: styles.colQty }, qtyDisplay(item, guestCount)),
          React.createElement(Text, { style: styles.colUnit }, UNIT_LABELS[item.unitType] ?? item.unitType),
          React.createElement(Text, { style: styles.colPrice }, formatUsd(item.unitPrice)),
          React.createElement(
            Text,
            { style: styles.colTotal },
            formatUsd(lineItemTotal(item, guestCount))
          )
        )
      )
    ];
  });
}

function buildFullServiceLineItemRows(
  itemsByCategory: Map<string, PdfLineItem[]>,
  guestCount: number
) {
  return categoriesWithItems(itemsByCategory).flatMap((cat) => {
    const items = itemsByCategory.get(cat) ?? [];
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
          { key: item.id, style: styles.tableRow },
          React.createElement(Text, { style: styles.colNameWide }, item.name),
          React.createElement(
            Text,
            { style: styles.colTotalWide },
            formatUsd(lineItemTotal(item, guestCount))
          )
        )
      )
    ];
  });
}

function buildTermsSection(): React.ReactElement {
  return React.createElement(
    View,
    { style: styles.termsBox },
    React.createElement(Text, { style: styles.sectionTitle }, QUOTE_TERMS_TITLE),
    ...QUOTE_TERMS_PARAGRAPHS.map((paragraph, index) =>
      React.createElement(Text, { key: `term-${index}`, style: styles.termsText }, paragraph)
    )
  );
}

/** Customer-facing quote PDF — used by both download and email attachment. */
export function buildCustomerQuotePdfDocument(
  quote: QuoteWithRelations,
  menuPreferences: PdfMenuPreference[] = []
): React.ReactElement {
  const guestCount = quote.event?.guestCountEstimate ?? 0;
  const serviceType = resolveServiceType(quote);
  const isTrayFormat = serviceType === "order_by_tray";
  const packageLines = quote.lineItems.filter((item) => item.unitType === "tiered_per_head");
  const customerType = quote.event?.customerType ?? "b2c";
  const uniqueLineItems = filterValidPdfAdditionalItems(
    deduplicateLineItems(quote.lineItems.filter((item) => item.unitType !== "tiered_per_head")),
    customerType
  );
  const lineItemsForPdf = [...packageLines, ...uniqueLineItems];
  const totals = calculateQuoteTotals(
    lineItemsForPdf,
    quote.taxRate,
    quote.depositPct,
    guestCount
  );
  const g = quote.event?.primaryGuest;
  const itemsByCategory = groupLineItemsByCategory(uniqueLineItems);
  const packages = resolvePackageLineItems(quote);
  const lineItemRows = isTrayFormat
    ? buildTrayLineItemRows(itemsByCategory, guestCount)
    : buildFullServiceLineItemRows(itemsByCategory, guestCount);
  const hasLineItems = lineItemRows.length > 0;
  const customerNotes = quote.notes?.trim();

  const packageSections = packages.flatMap((item) => {
    const tiers = item.package?.tiers ?? [];
    const activeTier =
      item.appliedTier != null
        ? tiers.find((t) => t.pricePerHead === item.appliedTier) ??
          getActiveTier(tiers, guestCount, customerType)
        : getActiveTier(tiers, guestCount, customerType);
    const pricePerHead = activeTier?.pricePerHead ?? item.unitPrice;
    const menuLines = packageMenuLines(menuPreferences, item.package?.items ?? []);
    const includesFallback = packageIncludeSummary(item.package?.items ?? []);

    return [
      React.createElement(
        View,
        { key: `pkg-${item.id}`, style: styles.packageBlock },
        React.createElement(Text, { style: styles.packageTitle }, item.name),
        React.createElement(
          Text,
          { style: styles.packageMeta },
          `${packageTierLabel(item)} · ${formatUsd(pricePerHead)}/person × ${guestCount} guests`
        ),
        menuLines.length > 0
          ? React.createElement(
              View,
              { key: `pkg-menu-${item.id}`, style: { marginTop: 4, marginBottom: 4 } },
              React.createElement(
                Text,
                { style: { ...styles.packageMeta, fontFamily: "Helvetica-Bold", marginBottom: 2 } },
                "Selected Menu:"
              ),
              ...menuLines.map((line, idx) =>
                React.createElement(
                  Text,
                  { key: `menu-line-${item.id}-${idx}`, style: styles.packageMeta },
                  line
                )
              )
            )
          : React.createElement(
              Text,
              { style: styles.packageMeta },
              `Includes: ${includesFallback}`
            ),
        React.createElement(
          Text,
          { style: { fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "right" } },
          formatUsd(lineItemTotal(item, guestCount))
        )
      )
    ];
  });

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
        React.createElement(Text, { style: styles.title }, "CATERING QUOTE")
      ),
      React.createElement(Text, { style: styles.sectionTitle }, "Guest Information"),
      React.createElement(
        View,
        null,
        React.createElement(
          View,
          { style: styles.detailRow },
          React.createElement(Text, { style: styles.detailLabel }, "Name:"),
          React.createElement(Text, { style: styles.detailValue }, guestDisplayName(quote))
        ),
        React.createElement(
          View,
          { style: styles.detailRow },
          React.createElement(Text, { style: styles.detailLabel }, "Email:"),
          React.createElement(Text, { style: styles.detailValue }, g?.email ?? "—")
        ),
        React.createElement(
          View,
          { style: styles.detailRow },
          React.createElement(Text, { style: styles.detailLabel }, "Phone:"),
          React.createElement(Text, { style: styles.detailValue }, g?.phone ?? "—")
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
            { style: styles.detailValue },
            formatPdfEventTime(quote.event ?? undefined)
          )
        ),
        React.createElement(
          View,
          { style: styles.detailRow },
          React.createElement(Text, { style: styles.detailLabel }, "Event Type:"),
          React.createElement(Text, { style: styles.detailValue }, formatEventTypeLabel(quote))
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
        )
      ),
      packages.length > 0
        ? React.createElement(Text, { style: styles.sectionTitle }, "Packages")
        : null,
      ...packageSections,
      hasLineItems
        ? React.createElement(
            Text,
            { style: styles.sectionTitle },
            isTrayFormat ? "Line Items" : "Additional Items"
          )
        : null,
      hasLineItems
        ? React.createElement(
            View,
            { style: styles.tableHeader },
            isTrayFormat
              ? [
                  React.createElement(Text, { key: "h-name", style: styles.colName }, "Item"),
                  React.createElement(Text, { key: "h-qty", style: styles.colQty }, "Qty"),
                  React.createElement(Text, { key: "h-unit", style: styles.colUnit }, "Unit Type"),
                  React.createElement(Text, { key: "h-price", style: styles.colPrice }, "Unit Price"),
                  React.createElement(Text, { key: "h-total", style: styles.colTotal }, "Total")
                ]
              : [
                  React.createElement(Text, { key: "h-name", style: styles.colNameWide }, "Item"),
                  React.createElement(Text, { key: "h-total", style: styles.colTotalWide }, "Total")
                ]
          )
        : null,
      ...lineItemRows,
      React.createElement(
        View,
        { style: styles.totalsBox },
        React.createElement(
          View,
          { style: styles.totalsRow },
          React.createElement(Text, null, "Subtotal"),
          React.createElement(Text, null, formatUsd(totals.subtotal))
        ),
        React.createElement(
          View,
          { style: styles.totalsRow },
          React.createElement(Text, null, `Tax (${formatTaxRatePercent(quote.taxRate)}%)`),
          React.createElement(Text, null, formatUsd(totals.tax))
        ),
        React.createElement(
          View,
          { style: styles.totalsRowBold },
          React.createElement(Text, null, "Grand Total"),
          React.createElement(Text, null, formatUsd(totals.grandTotal))
        ),
        React.createElement(
          View,
          { style: styles.totalsRow },
          React.createElement(Text, null, `Deposit Required (${Math.round(quote.depositPct * 100)}%)`),
          React.createElement(Text, null, formatUsd(totals.deposit))
        ),
        React.createElement(
          View,
          { style: styles.totalsRow },
          React.createElement(Text, null, "Balance Due"),
          React.createElement(Text, null, formatUsd(totals.balance))
        ),
        React.createElement(
          View,
          { style: { ...styles.totalsRow, borderBottomWidth: 0 } },
          React.createElement(Text, null, "Payment Due Date"),
          React.createElement(Text, null, formatPdfDate(quote.dueDate))
        )
      ),
      customerNotes
        ? React.createElement(
            View,
            null,
            React.createElement(Text, { style: styles.sectionTitle }, "Special Notes"),
            React.createElement(View, { style: styles.notesBox }, React.createElement(Text, null, customerNotes))
          )
        : null,
      buildTermsSection(),
      React.createElement(Text, { style: styles.footer }, "Thank you for choosing Tripeseats")
    )
  );
}

export async function generateCustomerQuotePdfBuffer(quote: QuoteWithRelations): Promise<Buffer> {
  try {
    const menuPreferences = quote.eventId
      ? await loadMenuPreferencesForEvent(quote.eventId)
      : [];
    const buffer = await renderToBuffer(buildCustomerQuotePdfDocument(quote, menuPreferences));
    return Buffer.from(buffer);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[pdf] Generation failed:", {
        quoteId: quote.id,
        error: err instanceof Error ? err.message : err,
        stack: err instanceof Error ? err.stack : undefined
      });
    }
    throw Object.assign(new Error("PDF generation failed"), {
      status: 500,
      originalError: err
    });
  }
}

/** @deprecated Use generateCustomerQuotePdfBuffer — kept for existing imports. */
export async function generateQuotePdfBuffer(quote: QuoteWithRelations): Promise<Buffer> {
  return generateCustomerQuotePdfBuffer(quote);
}

export function buildQuoteEmailHtml(
  quote: QuoteWithRelations,
  caterer: Caterer,
  menuPreferences: PdfMenuPreference[] = []
): string {
  const guestCount = quote.event?.guestCountEstimate ?? 0;
  const serviceType = resolveServiceType(quote);
  const isTrayFormat = serviceType === "order_by_tray";
  const packageLines = quote.lineItems.filter((item) => item.unitType === "tiered_per_head");
  const customerType = quote.event?.customerType ?? "b2c";
  const uniqueLineItems = filterValidPdfAdditionalItems(
    deduplicateLineItems(quote.lineItems.filter((item) => item.unitType !== "tiered_per_head")),
    customerType
  );
  const totals = calculateQuoteTotals(
    [...packageLines, ...uniqueLineItems],
    quote.taxRate,
    quote.depositPct,
    guestCount
  );
  const name = guestDisplayName(quote);
  const eventTitle = quote.event?.title ?? "Event";
  const eventDate = formatPdfDate(quote.event?.eventDate);
  const eventTime = formatPdfEventTime(quote.event ?? undefined);
  const location = eventLocationDisplay(quote);
  const itemsByCategory = groupLineItemsByCategory(uniqueLineItems);
  const packages = resolvePackageLineItems(quote);

  const packageHtml =
    packages.length > 0
      ? `<tr><td colspan="2" style="padding:8px 8px 4px;font-weight:bold;color:#1B2A4A;background:#eef1f6;">PACKAGES</td></tr>` +
        packages
          .map((item) => {
            const tiers = item.package?.tiers ?? [];
            const activeTier =
              item.appliedTier != null
                ? tiers.find((t) => t.pricePerHead === item.appliedTier) ??
                  getActiveTier(tiers, guestCount, customerType)
                : getActiveTier(tiers, guestCount, customerType);
            const selectedSummary = formatPackageSelectedMenuSummary(
              menuPreferences,
              item.package?.items ?? []
            );
            const includes =
              selectedSummary ?? packageIncludeSummary(item.package?.items ?? []);
            const pricePerHead = activeTier?.pricePerHead ?? item.unitPrice;
            return `<tr>
              <td colspan="2" style="padding:8px;border-bottom:1px solid #eee;">
                <strong>${escapeHtml(item.name)}</strong><br/>
                ${escapeHtml(packageTierLabel(item))} · ${escapeHtml(formatUsd(pricePerHead))}/person × ${guestCount} guests<br/>
                ${selectedSummary ? "Selected Menu: " : "Includes: "}${escapeHtml(includes)}<br/>
                <div style="text-align:right;font-weight:bold;margin-top:4px;">${escapeHtml(formatUsd(lineItemTotal(item, guestCount)))}</div>
              </td>
            </tr>`;
          })
          .join("")
      : "";

  const lineItemsHtml = categoriesWithItems(itemsByCategory)
    .flatMap((cat) => {
      const items = itemsByCategory.get(cat) ?? [];
      if (items.length === 0) return [];
      const rows = items
        .map((item) => {
          const qtyCell = isTrayFormat
            ? `${escapeHtml(qtyDisplay(item, guestCount))} · `
            : "";
          return `<tr>
            <td style="padding:4px 8px;border-bottom:1px solid #eee;">${escapeHtml(item.name)}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;">${qtyCell}${escapeHtml(formatUsd(lineItemTotal(item, guestCount)))}</td>
          </tr>`;
        })
        .join("");
      return [
        `<tr><td colspan="2" style="padding:8px 8px 4px;font-weight:bold;color:#1B2A4A;background:#eef1f6;">${escapeHtml(getCategoryDisplayName(cat))}</td></tr>`,
        rows
      ].join("");
    })
    .join("");

  const termsHtml = QUOTE_TERMS_PARAGRAPHS.map(
    (p) => `<p style="font-size:12px;color:#555;margin:0 0 8px;">${escapeHtml(p)}</p>`
  ).join("");

  const contactParts = [
    escapeHtml(caterer.name),
    `<a href="mailto:${escapeHtml(caterer.email)}">${escapeHtml(caterer.email)}</a>`
  ];
  if (caterer.phone) {
    contactParts.push(escapeHtml(caterer.phone));
  }

  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#1a1a1a;line-height:1.5;max-width:600px;">
  <p>Dear ${escapeHtml(name)},</p>
  <p>Please find your catering quote attached and summarized below:</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
    <tr>
      <td style="padding:8px;background:#1B2A4A;color:#fff;font-weight:bold;" colspan="2">Quote Summary</td>
    </tr>
    <tr>
      <td style="padding:8px;border-bottom:1px solid #ddd;"><strong>Event</strong></td>
      <td style="padding:8px;border-bottom:1px solid #ddd;">${escapeHtml(eventTitle)} on ${escapeHtml(eventDate)}${eventTime !== "—" ? ` at ${escapeHtml(eventTime)}` : ""} · ${escapeHtml(location)}</td>
    </tr>
    <tr>
      <td style="padding:8px;border-bottom:1px solid #ddd;"><strong>Guests</strong></td>
      <td style="padding:8px;border-bottom:1px solid #ddd;">${guestCount}</td>
    </tr>
    <tr><td colspan="2" style="padding:8px 0;border-top:2px solid #1B2A4A;"></td></tr>
    ${packageHtml}
    ${lineItemsHtml}
    <tr><td colspan="2" style="padding:8px 0;border-top:2px solid #1B2A4A;"></td></tr>
    <tr>
      <td style="padding:4px 8px;">Subtotal</td>
      <td style="padding:4px 8px;text-align:right;">${escapeHtml(formatUsd(totals.subtotal))}</td>
    </tr>
    <tr>
      <td style="padding:4px 8px;">Tax</td>
      <td style="padding:4px 8px;text-align:right;">${escapeHtml(formatUsd(totals.tax))}</td>
    </tr>
    <tr>
      <td style="padding:4px 8px;font-weight:bold;">Grand Total</td>
      <td style="padding:4px 8px;text-align:right;font-weight:bold;">${escapeHtml(formatUsd(totals.grandTotal))}</td>
    </tr>
    <tr>
      <td style="padding:4px 8px;">Deposit (${Math.round(quote.depositPct * 100)}%)</td>
      <td style="padding:4px 8px;text-align:right;">${escapeHtml(formatUsd(totals.deposit))}</td>
    </tr>
    <tr>
      <td style="padding:4px 8px;font-weight:bold;">Balance Due</td>
      <td style="padding:4px 8px;text-align:right;font-weight:bold;">${escapeHtml(formatUsd(totals.balance))}</td>
    </tr>
    <tr>
      <td style="padding:4px 8px;">Payment Due</td>
      <td style="padding:4px 8px;text-align:right;">${escapeHtml(formatPdfDate(quote.dueDate))}</td>
    </tr>
  </table>
  <h3 style="font-size:14px;color:#1B2A4A;margin:24px 0 8px;">${escapeHtml(QUOTE_TERMS_TITLE)}</h3>
  ${termsHtml}
  <p>Please reply to this email to confirm your booking.</p>
  <p style="color:#666;font-size:13px;margin-top:24px;border-top:1px solid #ddd;padding-top:12px;">
    Questions? Contact ${contactParts.join(" · ")}
  </p>
</body>
</html>`;
}
