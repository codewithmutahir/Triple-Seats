import type { QuoteOp } from "@/lib/quote-ops-types";

/**
 * Merge a new op into a pending batch (client-side queue coalescing).
 * - guest count: keep only the latest
 * - package add/remove: clear package + tier ops, then append
 * - package tier: keep only the latest
 * - update_item: merge patches for the same itemId
 */
export function coalesceQuoteOps(ops: QuoteOp[], next: QuoteOp): QuoteOp[] {
  let nextOps = [...ops];

  if (next.type === "set_guest_count") {
    nextOps = nextOps.filter((existing) => existing.type !== "set_guest_count");
  }

  if (next.type === "add_package" || next.type === "remove_package") {
    nextOps = nextOps.filter(
      (existing) =>
        existing.type !== "add_package" &&
        existing.type !== "remove_package" &&
        existing.type !== "set_package_tier"
    );
  }

  if (next.type === "set_package_tier") {
    nextOps = nextOps.filter((existing) => existing.type !== "set_package_tier");
  }

  if (next.type === "update_item") {
    for (let i = nextOps.length - 1; i >= 0; i -= 1) {
      const existing = nextOps[i];
      if (existing?.type === "update_item" && existing.itemId === next.itemId) {
        nextOps[i] = {
          ...existing,
          patch: { ...existing.patch, ...next.patch }
        };
        return nextOps;
      }
    }
  }

  nextOps.push(next);
  return nextOps;
}
