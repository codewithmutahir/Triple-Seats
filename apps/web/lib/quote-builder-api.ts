import { apiFetchJson } from "@/lib/api-client";
import { supportsApiFeature } from "@/lib/api-features";
import { quoteAnalytics } from "@/lib/quote-analytics";
import {
  MENU_SECTIONS,
  type CateringPackage,
  type ItemCategory,
  type MenuItem,
  type Quote
} from "@/components/quote/types";

export type QuoteBuilderPayload = {
  quote: Quote;
  packages: CateringPackage[];
  menuItemsByCategory: Partial<Record<ItemCategory, MenuItem[]>>;
};

async function fetchQuoteBuilderLegacy(eventId: string) {
  const quotesRes = await apiFetchJson<{ items: Quote[] }>(
    `/api/quotes/event/${encodeURIComponent(eventId)}`
  );
  if (!quotesRes.ok) return quotesRes;

  let quote = quotesRes.data.items.find((item) => item.status !== "archived") ?? quotesRes.data.items[0];
  if (!quote) {
    const createRes = await apiFetchJson<{ quote: Quote }>("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId })
    });
    if (!createRes.ok) return createRes;
    quote = createRes.data.quote;
    quoteAnalytics.quoteCreated({
      eventId,
      quoteId: quote.id,
      hasPackage: quote.lineItems.some((item) => item.unitType === "tiered_per_head")
    });
  }

  const customerType = quote.event?.customerType ?? "b2c";
  const [packagesRes, ...menuResults] = await Promise.all([
    apiFetchJson<{ items: CateringPackage[] }>(
      `/api/packages?customerType=${encodeURIComponent(customerType)}`
    ),
    ...MENU_SECTIONS.map((section) =>
      apiFetchJson<{ items: MenuItem[] }>(
        `/api/menu-items?category=${encodeURIComponent(section.category)}`
      )
    )
  ]);

  if (!packagesRes.ok) return packagesRes;

  const menuItemsByCategory: Partial<Record<ItemCategory, MenuItem[]>> = {};
  for (let i = 0; i < MENU_SECTIONS.length; i++) {
    const section = MENU_SECTIONS[i]!;
    const menuRes = menuResults[i]!;
    if (!menuRes.ok) return menuRes;
    menuItemsByCategory[section.category] = menuRes.data.items;
  }

  return {
    ok: true as const,
    data: {
      quote,
      packages: packagesRes.data.items,
      menuItemsByCategory
    }
  };
}

export async function fetchQuoteBuilder(eventId: string) {
  if (await supportsApiFeature("quoteBuilder")) {
    const batch = await apiFetchJson<QuoteBuilderPayload>(
      `/api/quotes/builder/${encodeURIComponent(eventId)}`
    );
    if (batch.ok && batch.data.quote) return batch;
    if (!batch.ok && batch.status !== 404) return batch;
  }
  return fetchQuoteBuilderLegacy(eventId);
}
