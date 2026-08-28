import { ApiError } from "@/lib/api-error";
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
import type { EventDetailPayload } from "@/lib/event-types";
import type { QuoteExportPayload } from "@/lib/quote-export";
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
    const error = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      revision?: number;
      code?: string;
    };
    const message = error.error ?? error.message ?? parseApiError(error, res.status, res.statusText);
    throw new ApiError(message, res.status, error as Record<string, unknown>);
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
      }).then((r) => r.event),
    updateCustomerType: (id: string, customerType: string) =>
      apiFetch<{ customerType: string; event: EventDetailPayload }>(
        `/api/events/${encodeURIComponent(id)}/customer-type`,
        {
          method: "PATCH",
          body: JSON.stringify({ customerType })
        }
      ),
    menuPreferences: (id: string) =>
      apiFetch<import("@/lib/menu-preference-types").MenuPreferencesPayload>(
        `/api/events/${encodeURIComponent(id)}/menu-preferences`
      ),
    updateMenuPreferences: (
      id: string,
      body: import("@/lib/menu-preference-types").MenuPreferencesSaveInput
    ) =>
      apiFetch<{ preferences: import("@/lib/menu-preference-types").MenuPreferenceEntry[] }>(
        `/api/events/${encodeURIComponent(id)}/menu-preferences`,
        { method: "PATCH", body: JSON.stringify(body) }
      ),
    updateTime: (id: string, eventTime: string | null) =>
      apiFetch<{ eventTime: string | null; event: EventDetailPayload }>(
        `/api/events/${encodeURIComponent(id)}/time`,
        { method: "PATCH", body: JSON.stringify({ eventTime }) }
      ).then((r) => r.event),
    clientHistory: (params: { email?: string; phone?: string; excludeEventId?: string }) => {
      const qs = new URLSearchParams();
      if (params.email) qs.set("email", params.email);
      if (params.phone) qs.set("phone", params.phone);
      if (params.excludeEventId) qs.set("excludeEventId", params.excludeEventId);
      return apiFetch<{ items: import("@/lib/payment-types").ClientHistoryEntry[] }>(
        `/api/events/client-history?${qs.toString()}`
      ).then((r) => r.items);
    }
  },

  payments: {
    byEvent: (eventId: string) =>
      apiFetch<import("@/lib/payment-types").EventPaymentsPayload>(
        `/api/payments/event/${encodeURIComponent(eventId)}`
      ),
    create: (body: {
      eventId: string;
      amount: number;
      method: import("@/lib/payment-types").PaymentMethod;
      note?: string;
      paymentDate?: string;
    }) =>
      apiFetch<
        import("@/lib/payment-types").EventPaymentsPayload & {
          payment: import("@/lib/payment-types").PaymentRecord;
        }
      >("/api/payments", { method: "POST", body: JSON.stringify(body) }),
    createLink: (body: {
      eventId: string;
      amount: number;
      note?: string;
      sendEmail?: boolean;
      idempotencyKey?: string;
    }) =>
      apiFetch<import("@/lib/payment-types").CreatePaymentLinkResult>("/api/payments/links", {
        method: "POST",
        body: JSON.stringify(body),
        headers: body.idempotencyKey
          ? { "Idempotency-Key": body.idempotencyKey }
          : undefined
      }),
    delete: (paymentId: string) =>
      apiFetch<
        import("@/lib/payment-types").EventPaymentsPayload & { ok: boolean; eventId: string }
      >(`/api/payments/${encodeURIComponent(paymentId)}`, { method: "DELETE" })
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
    builder: async (eventId: string): Promise<QuoteBuilderPayload> => {
      const res = await fetchQuoteBuilder(eventId);
      if (!res.ok || !res.data.quote) throw new Error(res.ok ? "Could not load quote." : res.message);
      return res.data;
    },
    addItem: (quoteId: string, item: Record<string, unknown>, idempotencyKey?: string) =>
      apiFetch<{ quote: QuoteBuilderPayload["quote"]; idempotent?: boolean }>(
        `/api/quotes/${encodeURIComponent(quoteId)}/items`,
        {
          method: "POST",
          body: JSON.stringify(item),
          headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined
        }
      ),
    applyOps: (
      quoteId: string,
      ops: import("@/lib/quote-ops-types").QuoteOp[],
      baseRevision?: number
    ) =>
      apiFetch<import("@/lib/quote-ops-types").ApplyQuoteOpsResponse>(
        `/api/quotes/${encodeURIComponent(quoteId)}/ops`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ops,
            ...(typeof baseRevision === "number" ? { baseRevision } : {})
          })
        }
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
    addPackage: (quoteId: string, packageId: string, tierId?: string) =>
      apiFetch<{ id: string; packageId: string; unitPrice: number; name: string }>(
        `/api/quotes/${encodeURIComponent(quoteId)}/package`,
        { method: "POST", body: JSON.stringify({ packageId, ...(tierId ? { tierId } : {}) }) }
      ),
    removePackage: (quoteId: string) =>
      apiFetch<{ ok: true }>(`/api/quotes/${encodeURIComponent(quoteId)}/package`, {
        method: "DELETE"
      }),
    updatePackageTier: (quoteId: string, tierId: string) =>
      apiFetch<{ quote: QuoteBuilderPayload["quote"] }>(
        `/api/quotes/${encodeURIComponent(quoteId)}/package/tier`,
        { method: "PATCH", body: JSON.stringify({ tierId }) }
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
    send: (quoteId: string, payload: QuoteExportPayload) =>
      apiFetch<{ status: string; quoteId: string }>(
        `/api/quotes/${encodeURIComponent(quoteId)}/send`,
        { method: "POST", body: JSON.stringify(payload) }
      ),
    pdf: (quoteId: string, payload: QuoteExportPayload) =>
      fetch(`/api/quotes/${encodeURIComponent(quoteId)}/pdf`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }),
    kitchenSheet: (quoteId: string, payload: QuoteExportPayload) =>
      fetch(`/api/quotes/${encodeURIComponent(quoteId)}/kitchen-sheet`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }),
    laborSheet: (quoteId: string, payload: QuoteExportPayload) =>
      fetch(`/api/quotes/${encodeURIComponent(quoteId)}/labor-sheet`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
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

  vendorCalendar: {
    entries: (params: { start: string; end: string; ownerUserId?: string; catererId?: string }) => {
      const qs = new URLSearchParams({ start: params.start, end: params.end });
      if (params.ownerUserId) qs.set("ownerUserId", params.ownerUserId);
      if (params.catererId) qs.set("catererId", params.catererId);
      return apiFetch<{
        items: import("@/lib/vendor-calendar-types").VendorCalendarEntry[];
        start: string;
        end: string;
      }>(`/api/vendor-calendar/entries?${qs}`);
    },
    create: (body: import("@/lib/vendor-calendar-types").VendorCalendarEntryInput) =>
      apiFetch<import("@/lib/vendor-calendar-types").VendorCalendarEntry>(
        "/api/vendor-calendar/entries",
        { method: "POST", body: JSON.stringify(body) }
      ),
    update: (id: string, body: Partial<import("@/lib/vendor-calendar-types").VendorCalendarEntryInput>) =>
      apiFetch<import("@/lib/vendor-calendar-types").VendorCalendarEntry>(
        `/api/vendor-calendar/entries/${encodeURIComponent(id)}`,
        { method: "PATCH", body: JSON.stringify(body) }
      ),
    remove: (id: string) =>
      apiFetch<void>(`/api/vendor-calendar/entries/${encodeURIComponent(id)}`, {
        method: "DELETE"
      }),
    duplicate: (
      id: string,
      body?: { startAt?: string; endAt?: string }
    ) =>
      apiFetch<import("@/lib/vendor-calendar-types").VendorCalendarEntry>(
        `/api/vendor-calendar/entries/${encodeURIComponent(id)}/duplicate`,
        { method: "POST", body: JSON.stringify(body ?? {}) }
      ),
    copyToMyCalendar: (
      id: string,
      body?: { startAt?: string; endAt?: string }
    ) =>
      apiFetch<import("@/lib/vendor-calendar-types").VendorCalendarEntry>(
        `/api/vendor-calendar/entries/${encodeURIComponent(id)}/copy-to-my-calendar`,
        { method: "POST", body: JSON.stringify(body ?? {}) }
      ),
    directory: (q?: string) => {
      const qs = q ? `?q=${encodeURIComponent(q)}` : "";
      return apiFetch<import("@/lib/vendor-calendar-types").VendorCalendarDirectory>(
        `/api/vendor-calendar/directory${qs}`
      );
    },
    grants: () =>
      apiFetch<{ items: import("@/lib/vendor-calendar-types").CalendarShareGrant[] }>(
        "/api/vendor-calendar/grants"
      ),
    createGrant: (body: { granteeUserId: string; targetUserId: string; scope?: "view" | "edit" }) =>
      apiFetch<import("@/lib/vendor-calendar-types").CalendarShareGrant>(
        "/api/vendor-calendar/grants",
        { method: "POST", body: JSON.stringify(body) }
      ),
    revokeGrant: (id: string) =>
      apiFetch<void>(`/api/vendor-calendar/grants/${encodeURIComponent(id)}`, {
        method: "DELETE"
      }),
    exportIcal: async (params: { start: string; end: string; ownerUserId?: string }) => {
      const qs = new URLSearchParams({ start: params.start, end: params.end });
      if (params.ownerUserId) qs.set("ownerUserId", params.ownerUserId);
      const res = await fetch(`/api/vendor-calendar/export?${qs}`, { credentials: "include" });
      if (!res.ok) {
        const text = await res.text();
        let message = "Export failed";
        try {
          const json = JSON.parse(text) as { error?: string };
          if (json.error) message = json.error;
        } catch {
          if (text.includes("Cannot GET")) {
            message = "Export isn't available right now. Please try again later.";
          }
        }
        throw new ApiError(message, res.status);
      }
      return res.text();
    },
    icalToken: () =>
      apiFetch<import("@/lib/vendor-calendar-types").VendorCalendarIcalToken>(
        "/api/vendor-calendar/ical-token",
        { method: "POST", body: "{}" }
      ),
    googleStatus: () =>
      apiFetch<import("@/lib/vendor-calendar-types").GoogleCalendarSyncStatus>(
        "/api/vendor-calendar/google/status"
      ),
    googleDisconnect: () =>
      apiFetch<{ ok: boolean }>("/api/vendor-calendar/google/disconnect", {
        method: "POST",
        body: "{}"
      }),
    googleSync: (body?: { start?: string; end?: string }) =>
      apiFetch<import("@/lib/vendor-calendar-types").GoogleCalendarSyncResult>(
        "/api/vendor-calendar/google/sync",
        { method: "POST", body: JSON.stringify(body ?? {}) }
      ),
    externalInvites: () =>
      apiFetch<{ items: import("@/lib/vendor-calendar-types").VendorCalendarExternalInvite[] }>(
        "/api/vendor-calendar/external-invites"
      ),
    inviteExternal: (body: { email: string; name?: string }) =>
      apiFetch<{
        invite: import("@/lib/vendor-calendar-types").VendorCalendarExternalInvite & {
          inviteStatus: string;
        };
        emailSent: boolean;
        existingAccountHasFullAccess?: boolean;
      }>("/api/vendor-calendar/external-invites", {
        method: "POST",
        body: JSON.stringify(body)
      }),
    revokeExternalInvite: (id: string) =>
      apiFetch<void>(`/api/vendor-calendar/external-invites/${encodeURIComponent(id)}`, {
        method: "DELETE"
      })
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
    clover: () =>
      apiFetch<{ clover: import("@/lib/settings-types").SettingsCloverConnection }>(
        "/api/caterer/clover"
      ).then((r) => r.clover),
    updateClover: (body: {
      merchantId: string;
      privateKey?: string;
      webhookSecret?: string;
      publicKey?: string;
    }) =>
      apiFetch<{ clover: import("@/lib/settings-types").SettingsCloverConnection }>(
        "/api/caterer/clover",
        { method: "PUT", body: JSON.stringify(body) }
      ).then((r) => r.clover),
    disconnectClover: () =>
      apiFetch<{
        ok: boolean;
        clover: import("@/lib/settings-types").SettingsCloverConnection;
      }>("/api/caterer/clover", { method: "DELETE" }).then((r) => r.clover),
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
  },

  team: {
    me: () =>
      apiFetch<{
        role: string;
        catererName: string;
        isTeamMember: boolean;
        isOwner: boolean;
        isSuperAdmin: boolean;
        isCalendarOnly: boolean;
      }>("/api/team/me"),
    list: () =>
      apiFetch<{
        members: Array<{
          id: string;
          email: string;
          role: string;
          inviteStatus: string;
          joinedAt: string | null;
          createdAt: string;
          userId: string | null;
          isOwner?: boolean;
          name?: string | null;
          phone?: string | null;
          jobTitle?: string | null;
        }>;
      }>("/api/team"),
    activity: () =>
      apiFetch<{
        logs: Array<{
          id: string;
          actorId: string;
          actorEmail: string | null;
          action: string;
          entityType: string | null;
          entityId: string | null;
          summary: string;
          createdAt: string;
        }>;
      }>("/api/team/activity"),
    updateProfile: (
      memberId: string,
      data: { name?: string | null; phone?: string | null; jobTitle?: string | null }
    ) =>
      apiFetch<{ member: { id: string; name: string | null; phone: string | null; jobTitle: string | null } }>(
        `/api/team/${encodeURIComponent(memberId)}/profile`,
        { method: "PATCH", body: JSON.stringify(data) }
      ),
    invite: (email: string, role: string) =>
      apiFetch<{ member: { id: string; email: string; role: string; inviteStatus: string } }>(
        "/api/team/invite",
        { method: "POST", body: JSON.stringify({ email, role }) }
      ),
    updateRole: (memberId: string, role: string) =>
      apiFetch<{ member: { id: string; role: string } }>(`/api/team/${encodeURIComponent(memberId)}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role })
      }),
    remove: (memberId: string) =>
      apiFetch<{ ok: boolean }>(`/api/team/${encodeURIComponent(memberId)}`, { method: "DELETE" })
  },

  invite: {
    get: (token: string) =>
      apiFetch<{
        email: string;
        role: string;
        catererName: string;
        token: string;
        expiresAt: string;
        willLimitToCalendarOnly?: boolean;
        existingAccountHasFullAccess?: boolean;
        accountExists?: boolean;
        magicLinkExpiresMinutes?: number;
      }>(`/api/invite/${encodeURIComponent(token)}`),
    complete: (
      token: string,
      body: { password: string; name?: string; acknowledgeLimitedAccess?: boolean }
    ) =>
      apiFetch<{ member: { id: string }; redirect: string }>(
        `/api/invite/${encodeURIComponent(token)}/complete`,
        { method: "POST", body: JSON.stringify(body) }
      ),
    sendMagicLink: (token: string) =>
      apiFetch<{ ok: boolean; email: string }>(
        `/api/invite/${encodeURIComponent(token)}/magic-link`,
        { method: "POST", body: JSON.stringify({}) }
      ),
    accept: (token: string) =>
      apiFetch<{ member: { id: string }; redirect: string }>(
        `/api/invite/${encodeURIComponent(token)}/accept`,
        { method: "POST", body: JSON.stringify({}) }
      )
  }
};
