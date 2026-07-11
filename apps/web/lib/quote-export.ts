/** Snapshot of quote builder UI state used to sync PDF/email exports. */
export type QuoteExportPayload = {
  packageId: string | null;
  guestCount: number;
};

type BuilderQuoteLike = {
  lineItems: { unitType: string; packageId?: string | null }[];
};

type BuilderEventLike = {
  guestCountEstimate: number | null;
};

export function buildExportPayloadFromBuilder(
  quote: BuilderQuoteLike,
  event: BuilderEventLike
): QuoteExportPayload {
  const packageLine = quote.lineItems.find((item) => item.unitType === "tiered_per_head");
  return {
    packageId: packageLine?.packageId ?? null,
    guestCount: Math.max(1, event.guestCountEstimate ?? 0)
  };
}
