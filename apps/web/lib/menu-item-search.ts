import { Document } from "flexsearch";

export type SearchableMenuItem = {
  id: string;
  name: string;
  defaultPrice: number | null;
  defaultUnit: string;
  usageCount: number;
  source: "catalog" | "quote";
  menuItemId?: string;
};

const MAX_RESULTS = 8;

export function createMenuItemIndex(items: SearchableMenuItem[]) {
  const byId = new Map<string, SearchableMenuItem>();

  const index = new Document<SearchableMenuItem>({
    tokenize: "forward",
    resolution: 9,
    cache: true,
    document: {
      id: "id",
      store: true,
      index: ["name"]
    }
  });

  for (const item of items) {
    byId.set(item.id, item);
    index.add(item);
  }

  return { index, byId };
}

function usageBoost(item: SearchableMenuItem): number {
  return Math.min(item.usageCount, 50) + (item.source === "quote" ? 100 : 0);
}

function substringFallback(items: SearchableMenuItem[], query: string, limit: number) {
  const q = query.trim().toLowerCase();
  if (!q) return items.slice(0, limit);

  return items
    .filter((item) => item.name.toLowerCase().includes(q))
    .sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aExact = aName === q ? 1000 : 0;
      const bExact = bName === q ? 1000 : 0;
      const aStarts = aName.startsWith(q) ? 100 : 0;
      const bStarts = bName.startsWith(q) ? 100 : 0;
      const aScore = aExact + aStarts + usageBoost(a);
      const bScore = bExact + bStarts + usageBoost(b);
      return bScore - aScore || a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

export function searchMenuItems(
  indexBundle: ReturnType<typeof createMenuItemIndex>,
  allItems: SearchableMenuItem[],
  query: string,
  limit = MAX_RESULTS
): SearchableMenuItem[] {
  const q = query.trim();
  if (!q) {
    return [...allItems]
      .sort((a, b) => usageBoost(b) - usageBoost(a) || a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  const { index, byId } = indexBundle;
  const raw = index.search({
    query: q,
    enrich: true,
    merge: true,
    suggest: true,
    limit: limit * 2
  }) as Array<{ id: string; doc?: SearchableMenuItem }> | { result?: Array<{ id: string; doc?: SearchableMenuItem }> };

  const hits: SearchableMenuItem[] = [];
  const seen = new Set<string>();

  const rows = Array.isArray(raw) ? raw : (raw.result ?? []);

  for (const row of rows) {
    const item = row.doc ?? byId.get(String(row.id));
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    hits.push(item);
  }

  if (hits.length < limit) {
    for (const item of substringFallback(allItems, q, limit)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      hits.push(item);
      if (hits.length >= limit) break;
    }
  }

  return hits
    .sort((a, b) => usageBoost(b) - usageBoost(a) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Highlight query matches in item name (case-insensitive). */
export function highlightName(name: string, query: string): { text: string; match: boolean }[] {
  const q = query.trim();
  if (!q) return [{ text: name, match: false }];

  const lowerName = name.toLowerCase();
  const lowerQ = q.toLowerCase();
  const idx = lowerName.indexOf(lowerQ);
  if (idx === -1) return [{ text: name, match: false }];

  const parts: { text: string; match: boolean }[] = [];
  if (idx > 0) parts.push({ text: name.slice(0, idx), match: false });
  parts.push({ text: name.slice(idx, idx + q.length), match: true });
  if (idx + q.length < name.length) {
    parts.push({ text: name.slice(idx + q.length), match: false });
  }
  return parts;
}
