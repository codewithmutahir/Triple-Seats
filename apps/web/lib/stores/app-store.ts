import { create } from "zustand";

export const LEADS_TTL = 2 * 60 * 1000;
export const DASHBOARD_TTL = 60 * 1000;
export const BOOKINGS_TTL = 2 * 60 * 1000;
export const EVENTS_TTL = 2 * 60 * 1000;
export const DISCUSSIONS_TTL = 2 * 60 * 1000;
export const TASKS_TTL = 60 * 1000;
export const REPORTS_TTL = 5 * 60 * 1000;

export interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

export type DashboardStats = {
  leads: { count: number; trend: string };
  bookings: { count: number; trend: string };
  upcomingEvents: { count: number; trend: string };
  revenue: { amount: number; trend: string };
};

export type DashboardRecentRow = {
  id: string;
  guestName: string;
  eventType: string;
  date: string;
  location: string;
  guestCount: number | null;
  status: string;
};

export type DashboardUpcomingRow = {
  id: string;
  title: string;
  date: string;
  venue: string;
  guestCount: number | null;
};

export type LeadsListResponse = {
  items: Array<{
    id: string;
    leadId: string | null;
    guestName: string;
    guestEmail: string | null;
    contactNumber: string | null;
    eventType: string;
    eventDate: string;
    location: string;
    guestCount: number | null;
    status: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  intakeMismatchWarning?: string;
};

export type BookingsListResponse = {
  items: Array<{
    eventId: string;
    guestName: string;
    guestEmail: string | null;
    eventType: string;
    eventDate: string;
    location: string;
    guestCount: number | null;
    status: string;
    quoteTotal: number | null;
    quoteId: string | null;
    depositStatus: "pending" | "paid";
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type BookingsStats = {
  confirmedThisMonth: number;
  completedAllTime: number;
  revenueThisMonth: number;
};

export type EventsListResponse = {
  items: Array<{
    id: string;
    guestName: string;
    eventType: string;
    eventDate: string;
    location: string;
    guestCount: number | null;
    status: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type EventsStats = {
  total: number;
  lead: number;
  discussion: number;
  booked: number;
  completed: number;
};

export type Conversation = {
  eventId: string;
  guestName: string;
  eventType: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
};

export type DiscussionThread = {
  event: {
    id: string;
    title: string;
    eventDate: string;
    guestName: string;
    guestEmail: string | null;
  };
  messages: Array<{
    id: string;
    eventId: string | null;
    direction: "inbound" | "outbound" | "internal";
    channel: string;
    body: string;
    senderName: string | null;
    senderEmail: string | null;
    createdAt: string;
  }>;
};

export type TaskItem = {
  id: string;
  title: string;
  status: "pending" | "completed";
  createdAt: string;
  event: {
    id: string;
    title: string;
    eventDate: string;
    venue: string;
  } | null;
};

export type TasksListResponse = {
  items: TaskItem[];
};

export type TasksStats = {
  total: number;
  pending: number;
  completed: number;
  dueSoon: number;
};

export type ReportsSummary = {
  revenue: {
    total: number;
    thisMonth: number;
    lastMonth: number;
    growth: number;
  };
  events: {
    total: number;
    thisMonth: number;
    lastMonth: number;
    byStatus: { lead: number; discussion: number; booked: number; completed: number };
    byType: { Wedding: number; Corporate: number; Birthday: number; Other: number };
  };
  leads: {
    total: number;
    thisMonth: number;
    conversionRate: number;
  };
  topMonths: Array<{ month: string; revenue: number; events: number }>;
  recentActivity: Array<{
    guestName: string;
    eventType: string;
    eventDate: string;
    revenue: number;
    status: string;
  }>;
};

export type ReportsTimeline = Array<{
  month: string;
  lead: number;
  discussion: number;
  booked: number;
  completed: number;
}>;

export type ReportsData = {
  filterKey: string;
  summary: ReportsSummary;
  timeline: ReportsTimeline;
};

function isFresh<T>(entry: CacheEntry<T> | null | undefined, ttl: number): boolean {
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < ttl;
}

interface AppStore {
  dashboardStats: CacheEntry<DashboardStats> | null;
  recentLeads: CacheEntry<DashboardRecentRow[]> | null;
  upcomingEvents: CacheEntry<DashboardUpcomingRow[]> | null;
  leadsCache: Record<string, CacheEntry<LeadsListResponse>>;
  bookingsCache: Record<string, CacheEntry<BookingsListResponse>>;
  bookingsStats: CacheEntry<BookingsStats> | null;
  eventsCache: Record<string, CacheEntry<EventsListResponse>>;
  eventsStats: CacheEntry<EventsStats> | null;
  discussionsConversations: CacheEntry<Conversation[]> | null;
  discussionsThreads: Record<string, CacheEntry<DiscussionThread>>;
  tasksCache: Record<string, CacheEntry<TasksListResponse>>;
  tasksStats: CacheEntry<TasksStats> | null;
  reportsCache: CacheEntry<ReportsData> | null;

  setDashboardStats: (data: DashboardStats) => void;
  setRecentLeads: (data: DashboardRecentRow[]) => void;
  setUpcomingEvents: (data: DashboardUpcomingRow[]) => void;
  setLeadsCache: (key: string, data: LeadsListResponse) => void;
  setBookingsCache: (key: string, data: BookingsListResponse) => void;
  setBookingsStats: (data: BookingsStats) => void;
  setEventsCache: (key: string, data: EventsListResponse) => void;
  setEventsStats: (data: EventsStats) => void;
  setDiscussionsConversations: (data: Conversation[]) => void;
  setDiscussionsThread: (eventId: string, data: DiscussionThread) => void;
  setTasksCache: (key: string, data: TasksListResponse | null) => void;
  setTasksStats: (data: TasksStats | null) => void;
  setReportsCache: (data: ReportsData | null) => void;

  getDashboardStats: () => DashboardStats | null;
  getRecentLeads: () => DashboardRecentRow[] | null;
  getUpcomingEvents: () => DashboardUpcomingRow[] | null;
  getLeadsCache: (key: string) => LeadsListResponse | null;
  getBookingsCache: (key: string) => BookingsListResponse | null;
  getBookingsStats: () => BookingsStats | null;
  getEventsCache: (key: string) => EventsListResponse | null;
  getEventsStats: () => EventsStats | null;
  getDiscussionsConversations: () => Conversation[] | null;
  getDiscussionsThread: (eventId: string) => DiscussionThread | null;
  getTasksCache: (key: string) => TasksListResponse | null;
  getTasksStats: () => TasksStats | null;
  getReportsCache: () => ReportsData | null;

  peekDashboardStats: () => DashboardStats | null;
  peekRecentLeads: () => DashboardRecentRow[] | null;
  peekUpcomingEvents: () => DashboardUpcomingRow[] | null;
  peekLeadsCache: (key: string) => LeadsListResponse | null;
  peekBookingsCache: (key: string) => BookingsListResponse | null;
  peekBookingsStats: () => BookingsStats | null;
  peekEventsCache: (key: string) => EventsListResponse | null;
  peekEventsStats: () => EventsStats | null;
  peekDiscussionsConversations: () => Conversation[] | null;
  peekDiscussionsThread: (eventId: string) => DiscussionThread | null;
  peekTasksCache: (key: string) => TasksListResponse | null;
  peekTasksStats: () => TasksStats | null;
  peekReportsCache: () => ReportsData | null;
}

export const useAppStore = create<AppStore>((set, get) => ({
  dashboardStats: null,
  recentLeads: null,
  upcomingEvents: null,
  leadsCache: {},
  bookingsCache: {},
  bookingsStats: null,
  eventsCache: {},
  eventsStats: null,
  discussionsConversations: null,
  discussionsThreads: {},
  tasksCache: {},
  tasksStats: null,
  reportsCache: null,

  setDashboardStats: (data) => set({ dashboardStats: { data, fetchedAt: Date.now() } }),
  setRecentLeads: (data) => set({ recentLeads: { data, fetchedAt: Date.now() } }),
  setUpcomingEvents: (data) => set({ upcomingEvents: { data, fetchedAt: Date.now() } }),
  setLeadsCache: (key, data) =>
    set((state) => ({
      leadsCache: { ...state.leadsCache, [key]: { data, fetchedAt: Date.now() } }
    })),
  setBookingsCache: (key, data) =>
    set((state) => ({
      bookingsCache: { ...state.bookingsCache, [key]: { data, fetchedAt: Date.now() } }
    })),
  setBookingsStats: (data) => set({ bookingsStats: { data, fetchedAt: Date.now() } }),
  setEventsCache: (key, data) =>
    set((state) => ({
      eventsCache: { ...state.eventsCache, [key]: { data, fetchedAt: Date.now() } }
    })),
  setEventsStats: (data) => set({ eventsStats: { data, fetchedAt: Date.now() } }),
  setDiscussionsConversations: (data) =>
    set({ discussionsConversations: { data, fetchedAt: Date.now() } }),
  setDiscussionsThread: (eventId, data) =>
    set((state) => ({
      discussionsThreads: {
        ...state.discussionsThreads,
        [eventId]: { data, fetchedAt: Date.now() }
      }
    })),
  setTasksCache: (key, data) =>
    set((state) => {
      if (data === null) {
        const { [key]: _removed, ...rest } = state.tasksCache;
        return { tasksCache: rest };
      }
      return {
        tasksCache: { ...state.tasksCache, [key]: { data, fetchedAt: Date.now() } }
      };
    }),
  setTasksStats: (data) =>
    set({ tasksStats: data === null ? null : { data, fetchedAt: Date.now() } }),
  setReportsCache: (data) =>
    set({ reportsCache: data === null ? null : { data, fetchedAt: Date.now() } }),

  getDashboardStats: () => {
    const entry = get().dashboardStats;
    return isFresh(entry, DASHBOARD_TTL) ? (entry?.data ?? null) : null;
  },
  getRecentLeads: () => {
    const entry = get().recentLeads;
    return isFresh(entry, DASHBOARD_TTL) ? (entry?.data ?? null) : null;
  },
  getUpcomingEvents: () => {
    const entry = get().upcomingEvents;
    return isFresh(entry, DASHBOARD_TTL) ? (entry?.data ?? null) : null;
  },
  getLeadsCache: (key) => {
    const entry = get().leadsCache[key];
    return isFresh(entry, LEADS_TTL) ? (entry?.data ?? null) : null;
  },
  getBookingsCache: (key) => {
    const entry = get().bookingsCache[key];
    return isFresh(entry, BOOKINGS_TTL) ? (entry?.data ?? null) : null;
  },
  getBookingsStats: () => {
    const entry = get().bookingsStats;
    return isFresh(entry, BOOKINGS_TTL) ? (entry?.data ?? null) : null;
  },
  getEventsCache: (key) => {
    const entry = get().eventsCache[key];
    return isFresh(entry, EVENTS_TTL) ? (entry?.data ?? null) : null;
  },
  getEventsStats: () => {
    const entry = get().eventsStats;
    return isFresh(entry, EVENTS_TTL) ? (entry?.data ?? null) : null;
  },
  getDiscussionsConversations: () => {
    const entry = get().discussionsConversations;
    return isFresh(entry, DISCUSSIONS_TTL) ? (entry?.data ?? null) : null;
  },
  getDiscussionsThread: (eventId) => {
    const entry = get().discussionsThreads[eventId];
    return isFresh(entry, DISCUSSIONS_TTL) ? (entry?.data ?? null) : null;
  },
  getTasksCache: (key) => {
    const entry = get().tasksCache[key];
    return isFresh(entry, TASKS_TTL) ? (entry?.data ?? null) : null;
  },
  getTasksStats: () => {
    const entry = get().tasksStats;
    return isFresh(entry, TASKS_TTL) ? (entry?.data ?? null) : null;
  },
  getReportsCache: () => {
    const entry = get().reportsCache;
    return isFresh(entry, REPORTS_TTL) ? (entry?.data ?? null) : null;
  },

  peekDashboardStats: () => get().dashboardStats?.data ?? null,
  peekRecentLeads: () => get().recentLeads?.data ?? null,
  peekUpcomingEvents: () => get().upcomingEvents?.data ?? null,
  peekLeadsCache: (key) => get().leadsCache[key]?.data ?? null,
  peekBookingsCache: (key) => get().bookingsCache[key]?.data ?? null,
  peekBookingsStats: () => get().bookingsStats?.data ?? null,
  peekEventsCache: (key) => get().eventsCache[key]?.data ?? null,
  peekEventsStats: () => get().eventsStats?.data ?? null,
  peekDiscussionsConversations: () => get().discussionsConversations?.data ?? null,
  peekDiscussionsThread: (eventId) => get().discussionsThreads[eventId]?.data ?? null,
  peekTasksCache: (key) => get().tasksCache[key]?.data ?? null,
  peekTasksStats: () => get().tasksStats?.data ?? null,
  peekReportsCache: () => get().reportsCache?.data ?? null
}));
