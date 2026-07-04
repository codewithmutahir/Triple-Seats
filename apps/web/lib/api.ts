import type { EventDetailPayload } from "@/lib/event-types";
import { fetchDashboardAll } from "@/lib/dashboard-api";
import { fetchQuoteBuilder, type QuoteBuilderPayload } from "@/lib/quote-builder-api";
import { parseApiError } from "@/lib/user-facing-error";
import type {
  BookingsListResponse,
  BookingsStats,
  ConversationsListResponse,
  DashboardAllResponse,
  DiscussionThread,
  EventsListResponse,
  EventsStats,
  LeadsListResponse,
  ReportsData,
  TasksListResponse,
  TasksStats
} from "@/lib/stores/app-store";
import {
  EMPTY_MENU_ITEMS_BY_CATEGORY,
  type SettingsMenuItemsByCategory,
  type SettingsPackage,
  type SettingsProfile
} from "@/lib/settings-types";
import type { CatererProfile } from "@/lib/caterer-profile";
import { CLIENT_LIST_FETCH_SIZE, fetchAllListPages } from "@/lib/client-list-filter";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });

  if (!res.ok) {
    const error = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(error.error ?? error.message ?? parseApiError(error, res.status, res.statusText));
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text.trim()) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

async function fetchLeadsPage(page: number, status = "all") {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("status", status);
  params.set("pageSize", String(CLIENT_LIST_FETCH_SIZE));
  return apiFetch<LeadsListResponse>(`/api/leads?${params}`);
}

async function fetchBookingsPage(page: number, status = "all") {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("status", status);
  params.set("pageSize", String(CLIENT_LIST_FETCH_SIZE));
  return apiFetch<BookingsListResponse>(`/api/bookings?${params}`);
}

async function fetchTasksPage(page: number) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(CLIENT_LIST_FETCH_SIZE));
  return apiFetch<TasksListResponse>(`/api/tasks?${params}`);
}

async function fetchConversationsPage(page: number) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(CLIENT_LIST_FETCH_SIZE));
  const res = await apiFetch<ConversationsListResponse>(`/api/messages/conversations?${params}`);
  return {
    items: res.conversations,
    total: res.total,
    pageSize: res.pageSize
  };
}

export const api = {
  dashboard: {
    all: async (): Promise<DashboardAllResponse> => {
      const res = await fetchDashboardAll();
      if (!res.ok) throw new Error(res.message);
      return res.data;
    }
  },

  profile: {
    dashboard: () => apiFetch<CatererProfile>("/api/dashboard/profile"),
    caterer: () => apiFetch<{ caterer: SettingsProfile }>("/api/caterer").then((r) => r.caterer)
  },

  events: {
    list: (params: URLSearchParams) => apiFetch<EventsListResponse>(`/api/leads?${params}`),
    listAll: async (): Promise<EventsListResponse["items"]> => {
      const result = await fetchAllListPages<EventsListResponse["items"][number]>(
        async (page) => fetchLeadsPage(page, "all"),
        CLIENT_LIST_FETCH_SIZE
      );
      if ("error" in result) throw new Error(result.error);
      return result.items;
    },
    detail: async (id: string): Promise<EventDetailPayload> => {
      const body = await apiFetch<{ event: EventDetailPayload }>(`/api/events/${encodeURIComponent(id)}`);
      if (!body.event) throw new Error("Invalid response");
      return body.event;
    },
    stats: () => apiFetch<EventsStats>("/api/events/stats"),
    update: (id: string, data: Record<string, unknown>) =>
      apiFetch<{ event: EventDetailPayload }>(`/api/events/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(data)
      }).then((r) => r.event),
    updateStatus: (id: string, status: string) =>
      apiFetch<{ event: EventDetailPayload }>(`/api/events/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      }).then((r) => r.event),
    updateNotes: (id: string, notes: string) =>
      apiFetch<{ event: EventDetailPayload }>(`/api/events/${encodeURIComponent(id)}/notes`, {
        method: "PATCH",
        body: JSON.stringify({ notes })
      }).then((r) => r.event),
    updateGuest: (id: string, data: Record<string, unknown>) =>
      apiFetch<{ event: EventDetailPayload }>(`/api/events/${encodeURIComponent(id)}/guest`, {
        method: "PATCH",
        body: JSON.stringify(data)
      }).then((r) => r.event)
  },

  leads: {
    list: (params: URLSearchParams) => apiFetch<LeadsListResponse>(`/api/leads?${params}`),
    listAll: async (): Promise<LeadsListResponse> => {
      const result = await fetchAllListPages<LeadsListResponse["items"][number]>(
        async (page) => fetchLeadsPage(page, "all"),
        CLIENT_LIST_FETCH_SIZE
      );
      if ("error" in result) throw new Error(result.error);
      return {
        items: result.items,
        total: result.total,
        page: 1,
        pageSize: 20,
        totalPages: Math.max(1, Math.ceil(result.total / 20))
      };
    }
  },

  quotes: {
    builder: async (eventId: string): Promise<QuoteBuilderPayload & { event?: QuoteBuilderPayload["quote"]["event"] }> => {
      const res = await fetchQuoteBuilder(eventId);
      if (!res.ok || !res.data.quote) throw new Error(res.ok ? "Could not load quote." : res.message);
      return res.data;
    },
    addItem: (quoteId: string, item: Record<string, unknown>) =>
      apiFetch<{ quote: QuoteBuilderPayload["quote"] }>(
        `/api/quotes/${encodeURIComponent(quoteId)}/items`,
        { method: "POST", body: JSON.stringify(item) }
      ),
    removeItem: (quoteId: string, itemId: string) =>
      apiFetch<{ quote: QuoteBuilderPayload["quote"] }>(
        `/api/quotes/${encodeURIComponent(quoteId)}/items/${encodeURIComponent(itemId)}`,
        { method: "DELETE" }
      ),
    updateItem: (quoteId: string, itemId: string, data: Record<string, unknown>) =>
      apiFetch<{ quote: QuoteBuilderPayload["quote"] }>(
        `/api/quotes/${encodeURIComponent(quoteId)}/items/${encodeURIComponent(itemId)}`,
        { method: "PATCH", body: JSON.stringify(data) }
      ),
    update: (quoteId: string, data: Record<string, unknown>) =>
      apiFetch<{ quote: QuoteBuilderPayload["quote"] }>(
        `/api/quotes/${encodeURIComponent(quoteId)}`,
        { method: "PATCH", body: JSON.stringify(data) }
      ),
    addPackage: (quoteId: string, packageId: string) =>
      apiFetch<{ quote: QuoteBuilderPayload["quote"] }>(
        `/api/quotes/${encodeURIComponent(quoteId)}/package`,
        { method: "POST", body: JSON.stringify({ packageId }) }
      ),
    removePackage: (quoteId: string) =>
      apiFetch<{ quote: QuoteBuilderPayload["quote"] }>(
        `/api/quotes/${encodeURIComponent(quoteId)}/package`,
        { method: "DELETE" }
      ),
    updateGuestCount: (quoteId: string, guestCount: number) =>
      apiFetch<{ quote: QuoteBuilderPayload["quote"] }>(
        `/api/quotes/${encodeURIComponent(quoteId)}/guest-count`,
        { method: "PATCH", body: JSON.stringify({ guestCount }) }
      ),
    duplicate: (quoteId: string) =>
      apiFetch<{ quote: QuoteBuilderPayload["quote"] }>(
        `/api/quotes/${encodeURIComponent(quoteId)}/duplicate`,
        { method: "POST" }
      ),
    send: (quoteId: string) =>
      apiFetch<{ ok: boolean }>(`/api/quotes/${encodeURIComponent(quoteId)}/send`, { method: "POST" }),
    pdf: (quoteId: string) =>
      fetch(`/api/quotes/${encodeURIComponent(quoteId)}/pdf`, { credentials: "include" })
  },

  tasks: {
    list: (params: URLSearchParams) => apiFetch<TasksListResponse>(`/api/tasks?${params}`),
    listAll: async (): Promise<TasksListResponse["items"]> => {
      const result = await fetchAllListPages<TasksListResponse["items"][number]>(
        async (page) => fetchTasksPage(page),
        CLIENT_LIST_FETCH_SIZE
      );
      if ("error" in result) throw new Error(result.error);
      return result.items;
    },
    stats: () => apiFetch<TasksStats>("/api/tasks/stats"),
    create: (data: Record<string, unknown>) =>
      apiFetch<{ task: TasksListResponse["items"][number] }>("/api/tasks", {
        method: "POST",
        body: JSON.stringify(data)
      }),
    update: (id: string, data: Record<string, unknown>) =>
      apiFetch<{ task: TasksListResponse["items"][number] }>(
        `/api/tasks/${encodeURIComponent(id)}`,
        { method: "PATCH", body: JSON.stringify(data) }
      ),
    delete: (id: string) =>
      apiFetch<{ ok: boolean }>(`/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" })
  },

  messages: {
    conversations: (params: URLSearchParams) =>
      apiFetch<ConversationsListResponse>(`/api/messages/conversations?${params}`),
    conversationsAll: async (): Promise<ConversationsListResponse["conversations"]> => {
      const result = await fetchAllListPages<ConversationsListResponse["conversations"][number]>(
        async (page) => fetchConversationsPage(page),
        CLIENT_LIST_FETCH_SIZE
      );
      if ("error" in result) throw new Error(result.error);
      return result.items;
    },
    thread: (eventId: string) =>
      apiFetch<DiscussionThread>(`/api/messages/event/${encodeURIComponent(eventId)}`),
    send: (data: Record<string, unknown>) =>
      apiFetch<{ message: DiscussionThread["messages"][number] }>("/api/messages", {
        method: "POST",
        body: JSON.stringify(data)
      })
  },

  bookings: {
    list: (params: URLSearchParams) => apiFetch<BookingsListResponse>(`/api/bookings?${params}`),
    listAll: async (): Promise<BookingsListResponse["items"]> => {
      const result = await fetchAllListPages<BookingsListResponse["items"][number]>(
        async (page) => fetchBookingsPage(page, "all"),
        CLIENT_LIST_FETCH_SIZE
      );
      if ("error" in result) throw new Error(result.error);
      return result.items;
    },
    stats: () => apiFetch<BookingsStats>("/api/bookings/stats")
  },

  calendar: {
    init: () => apiFetch<unknown>("/api/calendar/init")
  },

  reports: {
    summary: async (year: number, month: number): Promise<ReportsData> => {
      const params = new URLSearchParams({ year: String(year), month: String(month) });
      const [summary, timeline] = await Promise.all([
        apiFetch<ReportsData["summary"]>(`/api/reports/summary?${params}`),
        apiFetch<ReportsData["timeline"]>(`/api/reports/events-timeline?${params}`)
      ]);
      return { filterKey: `${year}-${month}`, summary, timeline };
    }
  },

  settings: {
    profile: () => api.profile.caterer(),
    updateProfile: (data: {
      name: string;
      email: string;
      phone: string | null;
      timezone: string;
      currencyCode: string;
      websiteUrl: string | null;
    }) =>
      apiFetch<{ caterer: SettingsProfile }>("/api/caterer", {
        method: "PATCH",
        body: JSON.stringify(data)
      }).then((r) => r.caterer),
    packages: () => apiFetch<{ items: SettingsPackage[] }>("/api/packages").then((r) => r.items),
    createPackage: (body: Record<string, unknown>) =>
      apiFetch<{ package: SettingsPackage }>("/api/packages", {
        method: "POST",
        body: JSON.stringify(body)
      }).then((r) => r.package),
    updatePackage: (id: string, body: Record<string, unknown>) =>
      apiFetch<{ package: SettingsPackage }>(`/api/packages/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(body)
      }).then((r) => r.package),
    deletePackage: (id: string) =>
      apiFetch<{ success: boolean }>(`/api/packages/${encodeURIComponent(id)}`, {
        method: "DELETE"
      }),
    updateTierPrice: (tierId: string, pricePerHead: number) =>
      apiFetch<{ tier: SettingsPackage["tiers"][number] }>(
        `/api/packages/tiers/${encodeURIComponent(tierId)}`,
        { method: "PATCH", body: JSON.stringify({ pricePerHead }) }
      ).then((r) => r.tier),
    menuItemsAll: async (): Promise<SettingsMenuItemsByCategory> => {
      const res = await fetch("/api/menu-items/all", {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        cache: "no-store"
      });

      if (res.ok) {
        const text = await res.text();
        const grouped = text.trim()
          ? (JSON.parse(text) as Partial<SettingsMenuItemsByCategory>)
          : {};
        return { ...EMPTY_MENU_ITEMS_BY_CATEGORY, ...grouped };
      }

      // Older API deployments may not expose GET /all yet; per-category routes still work.
      if (res.status === 404) {
        const { MENU_SECTIONS } = await import("@/components/quote/types");
        const grouped: SettingsMenuItemsByCategory = { ...EMPTY_MENU_ITEMS_BY_CATEGORY };
        const results = await Promise.all(
          MENU_SECTIONS.map(async (section) => {
            const data = await apiFetch<{ items: SettingsMenuItemsByCategory[keyof SettingsMenuItemsByCategory] }>(
              `/api/menu-items?category=${encodeURIComponent(section.category)}`
            );
            return { category: section.category, items: data.items ?? [] };
          })
        );
        for (const { category, items } of results) {
          grouped[category] = items;
        }
        for (const category of ["delivery", "other"] as const) {
          if (grouped[category].length > 0) continue;
          const data = await apiFetch<{ items: SettingsMenuItemsByCategory[typeof category] }>(
            `/api/menu-items?category=${encodeURIComponent(category)}`
          );
          grouped[category] = data.items ?? [];
        }
        return grouped;
      }

      const error = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      throw new Error(error.error ?? error.message ?? parseApiError(error, res.status, res.statusText));
    },
    createMenuItem: (body: Record<string, unknown>) =>
      apiFetch<{ item: SettingsMenuItemsByCategory[keyof SettingsMenuItemsByCategory][number] }>(
        "/api/menu-items",
        { method: "POST", body: JSON.stringify(body) }
      ).then((r) => r.item),
    updateMenuItem: (id: string, body: Record<string, unknown>) =>
      apiFetch<{ item: SettingsMenuItemsByCategory[keyof SettingsMenuItemsByCategory][number] }>(
        `/api/menu-items/${encodeURIComponent(id)}`,
        { method: "PUT", body: JSON.stringify(body) }
      ).then((r) => r.item),
    deleteMenuItem: (id: string) =>
      apiFetch<{ success: boolean }>(`/api/menu-items/${encodeURIComponent(id)}`, {
        method: "DELETE"
      }),
    /** @deprecated Use menuItemsAll — kept for legacy callers */
    menuItems: async (): Promise<SettingsMenuItemsByCategory> => {
      const { MENU_SECTIONS } = await import("@/components/quote/types");
      const grouped: SettingsMenuItemsByCategory = { ...EMPTY_MENU_ITEMS_BY_CATEGORY };
      const results = await Promise.all(
        MENU_SECTIONS.map(async (section) => {
          const data = await apiFetch<{ items: SettingsMenuItemsByCategory[keyof SettingsMenuItemsByCategory] }>(
            `/api/menu-items?category=${encodeURIComponent(section.category)}`
          );
          return { category: section.category, items: data.items ?? [] };
        })
      );
      for (const { category, items } of results) {
        grouped[category] = items;
      }
      for (const category of ["delivery", "other"] as const) {
        if (grouped[category].length > 0) continue;
        const data = await apiFetch<{ items: SettingsMenuItemsByCategory[typeof category] }>(
          `/api/menu-items?category=${encodeURIComponent(category)}`
        );
        grouped[category] = data.items ?? [];
      }
      return grouped;
    }
  }
};
