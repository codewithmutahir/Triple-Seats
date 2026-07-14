import type { QuoteBuilderPayload } from "@/lib/quote-builder-api";

export type QuoteOp =
  | {
      type: "add_item";
      clientRequestId: string;
      category: string;
      name: string;
      quantity?: number;
      unitPrice: number;
      unitType: string;
      notes?: string | null;
      menuItemId?: string | null;
    }
  | { type: "remove_item"; itemId: string }
  | {
      type: "update_item";
      itemId: string;
      patch: {
        name?: string;
        quantity?: number;
        unitPrice?: number;
        unitType?: string;
        notes?: string | null;
        category?: string;
      };
    }
  | { type: "set_guest_count"; guestCount: number }
  | { type: "add_package"; packageId: string; tierId?: string | null }
  | { type: "remove_package" }
  | { type: "set_package_tier"; tierId: string };

/** @deprecated Use QuoteOp */
export type QuoteLineOp = QuoteOp;

export type ApplyQuoteOpsResponse = {
  quote: QuoteBuilderPayload["quote"];
  applied: number;
  revision: number;
  guestCount?: number;
};
