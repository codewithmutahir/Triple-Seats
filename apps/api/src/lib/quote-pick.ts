export type QuoteStatusValue =
  | "draft"
  | "sending"
  | "send_failed"
  | "sent"
  | "accepted"
  | "declined"
  | "archived";

export type QuotePick = {
  id: string;
  totalAmount: number;
  status: QuoteStatusValue;
  updatedAt: Date;
};

const QUOTE_STATUS_PRIORITY: Record<QuoteStatusValue, number> = {
  accepted: 4,
  sent: 3,
  sending: 3,
  draft: 2,
  send_failed: 2,
  declined: 1,
  archived: 0
};

/** Prefer accepted quotes, then sent/draft; never require accepted status for revenue. */
export function pickBestQuote<T extends QuotePick>(quotes: T[]): T | null {
  const active = quotes.filter((q) => q.status !== "archived");
  if (!active.length) return null;
  return [...active].sort((a, b) => {
    const byStatus = QUOTE_STATUS_PRIORITY[b.status] - QUOTE_STATUS_PRIORITY[a.status];
    if (byStatus !== 0) return byStatus;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  })[0];
}
