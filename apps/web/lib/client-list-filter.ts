import type { PaginatedMeta } from "@/lib/list-pagination";

/** Max events fetched in one request for client-side tab filtering. */
export const CLIENT_EVENTS_FETCH_SIZE = 100;

export function filterAndPaginate<T extends { status: string }>(
  items: T[],
  opts: { status: string; page: number; pageSize: number }
): { items: T[] } & PaginatedMeta {
  const filtered =
    opts.status === "all" ? items : items.filter((item) => item.status === opts.status);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / opts.pageSize));
  const offset = (opts.page - 1) * opts.pageSize;

  return {
    items: filtered.slice(offset, offset + opts.pageSize),
    total,
    page: opts.page,
    pageSize: opts.pageSize,
    totalPages
  };
}

export async function fetchAllListPages<T extends { id: string }>(
  fetchPage: (page: number) => Promise<{ items: T[]; total: number; pageSize: number } | { error: string }>,
  pageSize: number
): Promise<{ items: T[]; total: number } | { error: string }> {
  const first = await fetchPage(1);
  if ("error" in first) return first;

  const allItems = [...first.items];
  if (first.total <= allItems.length) {
    return { items: allItems, total: first.total };
  }

  const totalPages = Math.ceil(first.total / pageSize);
  for (let page = 2; page <= totalPages; page++) {
    const next = await fetchPage(page);
    if ("error" in next) return next;
    allItems.push(...next.items);
  }

  return { items: allItems, total: first.total };
}
