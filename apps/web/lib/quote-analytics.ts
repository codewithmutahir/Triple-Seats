import type { ItemCategory, QuoteStatus } from "@/components/quote/types";

import { captureAnalytics } from "./posthog";

const PREFIX = "quote_builder";

type Context = {
  eventId?: string | null;
  quoteId?: string | null;
};

function track(action: string, properties?: Context & Record<string, unknown>) {
  captureAnalytics(`${PREFIX}_${action}`, properties);
}

/** Typed PostHog events for the quote builder workflow. */
export const quoteAnalytics = {
  opened(props: Context & { status?: QuoteStatus; guestCount?: number; lineItemCount?: number }) {
    track("opened", props);
  },

  quoteCreated(props: Context & { hasPackage?: boolean }) {
    track("quote_created", props);
  },

  packageSelected(
    props: Context & { packageId: string; packageName: string; guestCount: number; tierPrice?: number | null }
  ) {
    track("package_selected", props);
  },

  packageRemoved(props: Context & { packageId?: string | null; packageName?: string | null }) {
    track("package_removed", props);
  },

  guestCountChanged(props: Context & { from: number; to: number }) {
    track("guest_count_changed", props);
  },

  itemAdded(
    props: Context & {
      category: ItemCategory;
      name: string;
      unitType: string;
      quantity: number;
      unitPrice: number;
      menuItemId?: string | null;
    }
  ) {
    track("item_added", props);
  },

  itemRemoved(props: Context & { category: ItemCategory; name: string; itemId: string }) {
    track("item_removed", props);
  },

  itemUpdated(
    props: Context & {
      category: ItemCategory;
      name: string;
      itemId: string;
      fields: string[];
    }
  ) {
    track("item_updated", props);
  },

  packageItemsUpdated(props: Context & { categories: string[]; totalSelections: number }) {
    track("package_items_updated", props);
  },

  sectionToggled(props: Context & { category: ItemCategory; isOpen: boolean }) {
    track("section_toggled", props);
  },

  settingsUpdated(props: Context & { fields: string[]; taxRate?: number; depositPct?: number }) {
    track("settings_updated", props);
  },

  statusChanged(props: Context & { fromStatus: QuoteStatus | string; toStatus: QuoteStatus | string }) {
    track("status_changed", props);
  },

  deliveryAdded(props: Context & { distance: number; rate: number; total: number }) {
    track("delivery_added", props);
  },

  duplicate(props: Context) {
    track("duplicate", props);
  },

  pdfGenerated(props: Context & { grandTotal: number }) {
    track("pdf_generated", props);
  },

  sent(props: Context & { grandTotal: number; guestEmail?: string }) {
    track("sent", props);
  },

  draftSaved(props: Context) {
    track("draft_saved", props);
  },

  eventStatusChanged(props: { eventId: string; fromStatus: string; toStatus: string }) {
    track("event_status_changed", props);
  },

  taskAdded(props: { eventId: string; taskTitle: string; source?: "quick" | "list" }) {
    track("task_added", props);
  },

  taskUpdated(props: { eventId: string; taskId: string; completed: boolean }) {
    track("task_updated", props);
  },

  taskDeleted(props: { eventId: string; taskId: string }) {
    track("task_deleted", props);
  },

  messageSent(props: { eventId: string; direction?: string; asEmail?: boolean }) {
    track("message_sent", props);
  },

  createQuoteClicked(props: { eventId: string }) {
    track("create_quote_clicked", props);
  }
};
