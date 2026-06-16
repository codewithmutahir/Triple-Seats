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
  calculateQuoteTotals,
  formatUsd,
  lineItemTotal
} from "./quote-totals";
import type { QuoteWithRelations } from "./quote-serialize";

type Caterer = Prisma.CatererGetPayload<Record<string, never>>;

const NAVY = "#1B2A4A";

const CATEGORY_ORDER = [
  "appetizer",
  "main_course",
  "bbq",
  "dessert",
  "equipment",
  "delivery",
  "other"
] as const;

const CATEGORY_LABELS: Record<(typeof CATEGORY_ORDER)[number], string> = {
  appetizer: "APPETIZER",
  main_course: "MAIN COURSE",
  bbq: "BBQ",
  dessert: "DESSERT",
  equipment: "EQUIPMENT",
  delivery: "DELIVERY",
  other: "OTHER"
};

const UNIT_LABELS: Record<string, string> = {
  per_head: "Per Head",
  by_tray: "By Tray",
  flat: "Flat Rate"
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
    borderBottomColor: NAVY,
    paddingBottom: 12
  },
  logo: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: NAVY
  },
  title: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    letterSpacing: 1
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
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
    backgroundColor: NAVY,
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
    color: NAVY,
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
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 9,
    color: "#666",
    borderTopWidth: 1,
    borderTopColor: "#ccc",
    paddingTop: 10
  }
});

function formatDate(iso: Date | string | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function guestName(quote: QuoteWithRelations): string {
  const g = quote.event?.primaryGuest;
  if (!g) return "Guest";
  return [g.firstName, g.lastName].filter(Boolean).join(" ") || "Guest";
}

function eventLocation(quote: QuoteWithRelations): string {
  const parts = [quote.event?.venueName, quote.event?.venueAddress].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Location TBD";
}

function qtyDisplay(item: QuoteWithRelations["lineItems"][number], guestCount: number): string {
  if (item.unitType === "per_head") return String(guestCount);
  return String(item.quantity);
}

function groupItemsByCategory(quote: QuoteWithRelations) {
  const map = new Map<string, QuoteWithRelations["lineItems"]>();
  for (const cat of CATEGORY_ORDER) {
    map.set(cat, []);
  }
  for (const item of quote.lineItems) {
    const list = map.get(item.category) ?? [];
    list.push(item);
    map.set(item.category, list);
  }
  return map;
}

function buildQuotePdfDocument(quote: QuoteWithRelations): React.ReactElement {
  const guestCount = quote.event?.guestCountEstimate ?? 0;
  const totals = calculateQuoteTotals(
    quote.lineItems,
    quote.taxRate,
    quote.depositPct,
    guestCount
  );
  const g = quote.event?.primaryGuest;
  const itemsByCategory = groupItemsByCategory(quote);

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(
        View,
        { style: styles.headerRow },
        React.createElement(Text, { style: styles.logo }, "CaterPro"),
        React.createElement(Text, { style: styles.title }, "CATERING QUOTE")
      ),
      React.createElement(Text, { style: styles.sectionTitle }, "Quote Details"),
      React.createElement(
        View,
        null,
        React.createElement(
          View,
          { style: styles.detailRow },
          React.createElement(Text, { style: styles.detailLabel }, "Quote ID:"),
          React.createElement(Text, { style: styles.detailValue }, quote.id)
        ),
        React.createElement(
          View,
          { style: styles.detailRow },
          React.createElement(Text, { style: styles.detailLabel }, "Date:"),
          React.createElement(Text, { style: styles.detailValue }, formatDate(quote.createdAt))
        ),
        React.createElement(
          View,
          { style: styles.detailRow },
          React.createElement(Text, { style: styles.detailLabel }, "Due Date:"),
          React.createElement(Text, { style: styles.detailValue }, formatDate(quote.dueDate))
        )
      ),
      React.createElement(Text, { style: styles.sectionTitle }, "Guest Information"),
      React.createElement(
        View,
        null,
        React.createElement(
          View,
          { style: styles.detailRow },
          React.createElement(Text, { style: styles.detailLabel }, "Name:"),
          React.createElement(Text, { style: styles.detailValue }, guestName(quote))
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
            formatDate(quote.event?.eventDate)
          )
        ),
        React.createElement(
          View,
          { style: styles.detailRow },
          React.createElement(Text, { style: styles.detailLabel }, "Location:"),
          React.createElement(Text, { style: styles.detailValue }, eventLocation(quote))
        )
      ),
      React.createElement(Text, { style: styles.sectionTitle }, "Line Items"),
      React.createElement(
        View,
        { style: styles.tableHeader },
        React.createElement(Text, { style: styles.colName }, "Item"),
        React.createElement(Text, { style: styles.colQty }, "Qty"),
        React.createElement(Text, { style: styles.colUnit }, "Unit Type"),
        React.createElement(Text, { style: styles.colPrice }, "Unit Price"),
        React.createElement(Text, { style: styles.colTotal }, "Total")
      ),
      ...CATEGORY_ORDER.flatMap((cat) => {
        const items = itemsByCategory.get(cat) ?? [];
        if (items.length === 0) return [];
        return [
          React.createElement(
            View,
            { key: `cat-${cat}`, style: styles.categoryHeader },
            React.createElement(Text, null, CATEGORY_LABELS[cat])
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
      }),
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
          React.createElement(Text, null, `Tax (${(quote.taxRate * 100).toFixed(1)}%)`),
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
          React.createElement(Text, null, formatDate(quote.dueDate))
        )
      ),
      React.createElement(
        Text,
        { style: styles.footer },
        "Thank you for choosing CaterPro"
      )
    )
  );
}

export async function generateQuotePdfBuffer(quote: QuoteWithRelations): Promise<Buffer> {
  const buffer = await renderToBuffer(buildQuotePdfDocument(quote));
  return Buffer.from(buffer);
}

export function buildQuoteEmailHtml(quote: QuoteWithRelations, caterer: Caterer): string {
  const guestCount = quote.event?.guestCountEstimate ?? 0;
  const totals = calculateQuoteTotals(
    quote.lineItems,
    quote.taxRate,
    quote.depositPct,
    guestCount
  );
  const name = guestName(quote);
  const eventTitle = quote.event?.title ?? "Event";
  const eventDate = formatDate(quote.event?.eventDate);
  const location = eventLocation(quote);
  const itemsByCategory = groupItemsByCategory(quote);

  const lineItemsHtml = CATEGORY_ORDER.flatMap((cat) => {
    const items = itemsByCategory.get(cat) ?? [];
    if (items.length === 0) return [];
    const rows = items
      .map(
        (item) =>
          `<tr>
            <td style="padding:4px 8px;border-bottom:1px solid #eee;">${escapeHtml(item.name)}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;">${escapeHtml(formatUsd(lineItemTotal(item, guestCount)))}</td>
          </tr>`
      )
      .join("");
    return [
      `<tr><td colspan="2" style="padding:8px 8px 4px;font-weight:bold;color:#1B2A4A;background:#eef1f6;">${escapeHtml(CATEGORY_LABELS[cat])}</td></tr>`,
      rows
    ].join("");
  }).join("");

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
  <p>Please find your catering quote below:</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
    <tr>
      <td style="padding:8px;background:#1B2A4A;color:#fff;font-weight:bold;" colspan="2">Quote Summary</td>
    </tr>
    <tr>
      <td style="padding:8px;border-bottom:1px solid #ddd;"><strong>Event</strong></td>
      <td style="padding:8px;border-bottom:1px solid #ddd;">${escapeHtml(eventTitle)} on ${escapeHtml(eventDate)} at ${escapeHtml(location)}</td>
    </tr>
    <tr>
      <td style="padding:8px;border-bottom:1px solid #ddd;"><strong>Guests</strong></td>
      <td style="padding:8px;border-bottom:1px solid #ddd;">${guestCount}</td>
    </tr>
    <tr><td colspan="2" style="padding:8px 0;border-top:2px solid #1B2A4A;"></td></tr>
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
      <td style="padding:4px 8px;text-align:right;">${escapeHtml(formatDate(quote.dueDate))}</td>
    </tr>
  </table>
  <p>Please reply to this email to confirm your booking.</p>
  <p style="color:#666;font-size:13px;margin-top:24px;border-top:1px solid #ddd;padding-top:12px;">
    Questions? Contact ${contactParts.join(" · ")}
  </p>
</body>
</html>`;
}
