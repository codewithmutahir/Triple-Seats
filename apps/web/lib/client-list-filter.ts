import type { PaginatedMeta } from "@/lib/list-pagination";

/** Max rows fetched in one request when building a client-side list cache. */
export const CLIENT_LIST_FETCH_SIZE = 100;

export const LIST_PAGE_SIZE = 20;

/** @deprecated Use CLIENT_LIST_FETCH_SIZE */
export const CLIENT_EVENTS_FETCH_SIZE = CLIENT_LIST_FETCH_SIZE;

export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number = LIST_PAGE_SIZE
): { items: T[] } & PaginatedMeta {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const offset = (page - 1) * pageSize;

  return {
    items: items.slice(offset, offset + pageSize),
    total,
    page,
    pageSize,
    totalPages
  };
}

export function filterAndPaginate<T extends { status: string }>(
  items: T[],
  opts: { status: string; page: number; pageSize: number }
): { items: T[] } & PaginatedMeta {
  const filtered =
    opts.status === "all" ? items : items.filter((item) => item.status === opts.status);
  return paginateItems(filtered, opts.page, opts.pageSize);
}

export function filterLeadsItems<
  T extends {
    status: string;
    guestName: string;
    guestEmail: string | null;
    contactNumber: string | null;
    eventDate: string;
  }
>(
  items: T[],
  opts: { status: string; search: string; dateFrom?: string; dateTo?: string }
): T[] {
  let filtered = items;

  if (opts.status !== "all") {
    filtered = filtered.filter((item) => item.status === opts.status);
  }

  if (opts.search) {
    const q = opts.search.toLowerCase();
    filtered = filtered.filter(
      (item) =>
        item.guestName.toLowerCase().includes(q) ||
        item.guestEmail?.toLowerCase().includes(q) ||
        item.contactNumber?.toLowerCase().includes(q)
    );
  }

  if (opts.dateFrom || opts.dateTo) {
    filtered = filtered.filter((item) => {
      const day = item.eventDate.slice(0, 10);
      if (opts.dateFrom && day < opts.dateFrom) return false;
      if (opts.dateTo && day > opts.dateTo) return false;
      return true;
    });
  }

  return filtered;
}

export function filterBookingItems<
  T extends {
    status: string;
    guestName: string;
    guestEmail: string | null;
    eventDate: string;
  }
>(
  items: T[],
  opts: { status: string; search: string; month: string; year: string }
): T[] {
  let filtered = items;

  if (opts.status !== "all") {
    filtered = filtered.filter((item) => item.status === opts.status);
  }

  if (opts.search) {
    const q = opts.search.toLowerCase();
    filtered = filtered.filter(
      (item) =>
        item.guestName.toLowerCase().includes(q) || item.guestEmail?.toLowerCase().includes(q)
    );
  }

  if (opts.month !== "all" || opts.year !== "all") {
    const monthNum = opts.month !== "all" ? parseInt(opts.month, 10) : null;
    const yearNum = opts.year !== "all" ? parseInt(opts.year, 10) : null;

    filtered = filtered.filter((item) => {
      const d = new Date(item.eventDate);
      if (Number.isNaN(d.getTime())) return false;
      if (monthNum != null && d.getMonth() + 1 !== monthNum) return false;
      if (yearNum != null && d.getFullYear() !== yearNum) return false;
      return true;
    });
  }

  return filtered;
}

export function filterTaskItems<
  T extends {
    title: string;
    status: "pending" | "completed";
    createdAt: string;
    event: { id: string } | null;
  }
>(items: T[], opts: { status: string; search: string; eventId?: string }): T[] {
  let filtered = items;

  if (opts.status === "pending") {
    filtered = filtered.filter((item) => item.status === "pending");
  } else if (opts.status === "completed") {
    filtered = filtered.filter((item) => item.status === "completed");
  }

  if (opts.eventId) {
    filtered = filtered.filter((item) => item.event?.id === opts.eventId);
  }

  if (opts.search) {
    const q = opts.search.toLowerCase();
    filtered = filtered.filter((item) => item.title.toLowerCase().includes(q));
  }

  return [...filtered].sort((a, b) => {
    const aPending = a.status === "pending" ? 0 : 1;
    const bPending = b.status === "pending" ? 0 : 1;
    if (aPending !== bPending) return aPending - bPending;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function filterConversationItems<T extends { guestName: string; eventType: string }>(
  items: T[],
  search: string
): T[] {
  if (!search.trim()) return items;
  const q = search.trim().toLowerCase();
  return items.filter(
    (item) =>
      item.guestName.toLowerCase().includes(q) || item.eventType.toLowerCase().includes(q)
  );
}

export async function fetchAllListPages<T>(
  fetchPage: (
    page: number
  ) => Promise<
    { items: T[]; total: number; pageSize: number } | { error: string; status?: number }
  >,
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
