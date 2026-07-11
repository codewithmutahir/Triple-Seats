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
import {
  formatPdfDate,
  formatPdfEventTime,
  guestDisplayName,
  eventLocationDisplay,
  kitchenPortionLabel,
  PDF_NAVY
} from "./pdf-shared";
import type { QuoteWithRelations } from "./quote-serialize";

export type LaborSheetInput = {
  quote: QuoteWithRelations;
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
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee"
  },
  blockMeta: {
    fontSize: 11,
    color: "#555555"
  },
  footer: {
    marginTop: 24,
    fontSize: 10,
    color: "#666666",
    textAlign: "center"
  }
});

function formatServiceLabel(quote: QuoteWithRelations): string {
  const event = quote.event;
  if (!event) return "—";
  const serviceType =
    event.serviceType ?? legacyEventToServiceFields(event.eventType).serviceType;
  const orderMode = event.orderMode ?? legacyEventToServiceFields(event.eventType).orderMode;
  return formatEventServiceLabel(serviceType, orderMode);
}

export function buildLaborSheetPdfDocument(input: LaborSheetInput): React.ReactElement {
  const { quote } = input;
  const guestCount = quote.event?.guestCountEstimate ?? 0;
  const laborItems = quote.lineItems.filter(
    (item) => item.unitType !== "tiered_per_head" && item.category === "labor"
  );

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
          React.createElement(
            Text,
            { key: "staff-empty", style: styles.blockMeta },
            "No staffing line items on this quote yet."
          )
        ];

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
        React.createElement(Text, { style: styles.title }, "LABOR SHEET")
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
      React.createElement(Text, { style: styles.sectionTitle }, "Staffing Required"),
      ...staffingRows,
      React.createElement(
        Text,
        { style: styles.footer },
        "Staffing copy — headcount only, no pricing"
      )
    )
  );
}

export async function generateLaborSheetPdfBuffer(input: LaborSheetInput): Promise<Buffer> {
  try {
    const buffer = await renderToBuffer(buildLaborSheetPdfDocument(input));
    return Buffer.from(buffer);
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[labor-sheet] Generation failed:", {
        quoteId: input.quote.id,
        error: err instanceof Error ? err.message : err
      });
    }
    throw Object.assign(new Error("Labor sheet PDF generation failed"), {
      status: 500,
      originalError: err
    });
  }
}
