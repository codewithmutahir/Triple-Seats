import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: {
    quotes: {
      applyOps: vi.fn()
    }
  }
}));

vi.mock("@/lib/quote-analytics", () => ({
  quoteAnalytics: {
    opsBatchSaved: vi.fn(),
    opsBatchFailed: vi.fn()
  }
}));

import { api } from "@/lib/api";
import { QuoteOpsQueue } from "@/lib/quote-ops-queue";

describe("QuoteOpsQueue waiter isolation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(api.quotes.applyOps).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not resolve a later waiter with an earlier in-flight batch", async () => {
    const queue = new QuoteOpsQueue("evt-test");
    let resolveFirst!: (value: unknown) => void;

    vi.mocked(api.quotes.applyOps)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce({
        quote: {
          id: "q1",
          revision: 2,
          lineItems: [{ id: "pkg", unitType: "tiered_per_head", packageId: "p2" }],
          totalAmount: 0,
          taxRate: 0.0875,
          depositPct: 0.5
        },
        applied: 1,
        revision: 2,
        guestCount: 500
      } as never);

    const guestWait = queue.enqueueAndWait("q1", {
      type: "set_guest_count",
      guestCount: 400
    });

    await vi.advanceTimersByTimeAsync(300);

    const packageWait = queue.enqueueAndWait("q1", {
      type: "add_package",
      packageId: "p2",
      tierId: null
    });

    resolveFirst({
      quote: {
        id: "q1",
        revision: 1,
        lineItems: [],
        totalAmount: 0,
        taxRate: 0.0875,
        depositPct: 0.5
      },
      applied: 1,
      revision: 1,
      guestCount: 400
    });

    const guestResult = await guestWait;
    expect(guestResult.guestCount).toBe(400);
    expect(guestResult.quote.lineItems).toEqual([]);

    await vi.advanceTimersByTimeAsync(300);
    const packageResult = await packageWait;
    expect(packageResult.quote.lineItems.some((i: { unitType: string }) => i.unitType === "tiered_per_head")).toBe(
      true
    );
    expect(api.quotes.applyOps).toHaveBeenCalledTimes(2);
  });
});
