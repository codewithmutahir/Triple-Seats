export type ListFilters = Record<string, string | number | boolean | undefined>;

export const queryKeys = {
  dashboard: {
    all: ["dashboard"] as const,
    stats: () => [...queryKeys.dashboard.all, "stats"] as const,
    recent: () => [...queryKeys.dashboard.all, "recent"] as const,
    upcoming: () => [...queryKeys.dashboard.all, "upcoming"] as const
  },

  events: {
    all: ["events"] as const,
    list: (filters: ListFilters = {}) => [...queryKeys.events.all, "list", filters] as const,
    listAll: () => [...queryKeys.events.all, "list", "__all__"] as const,
    detail: (id: string) => [...queryKeys.events.all, "detail", id] as const,
    stats: () => [...queryKeys.events.all, "stats"] as const
  },

  leads: {
    all: ["leads"] as const,
    list: (filters: ListFilters = {}) => [...queryKeys.leads.all, "list", filters] as const,
    listAll: () => [...queryKeys.leads.all, "list", "__all__"] as const
  },

  quotes: {
    all: ["quotes"] as const,
    builder: (eventId: string) => [...queryKeys.quotes.all, "builder", eventId] as const,
    detail: (id: string) => [...queryKeys.quotes.all, "detail", id] as const
  },

  packages: {
    all: ["packages"] as const,
    list: (customerType: string) => [...queryKeys.packages.all, "list", customerType] as const
  },

  tasks: {
    all: ["tasks"] as const,
    list: (filters: ListFilters = {}) => [...queryKeys.tasks.all, "list", filters] as const,
    listAll: () => [...queryKeys.tasks.all, "list", "__all__"] as const,
    stats: () => [...queryKeys.tasks.all, "stats"] as const,
    byEvent: (eventId: string) => [...queryKeys.tasks.all, "event", eventId] as const
  },

  messages: {
    all: ["messages"] as const,
    conversations: () => [...queryKeys.messages.all, "conversations"] as const,
    conversationsAll: () => [...queryKeys.messages.all, "conversations", "__all__"] as const,
    thread: (eventId: string) => [...queryKeys.messages.all, "thread", eventId] as const
  },

  calendar: {
    all: ["calendar"] as const,
    init: () => [...queryKeys.calendar.all, "init"] as const
  },

  bookings: {
    all: ["bookings"] as const,
    list: (filters: ListFilters = {}) => [...queryKeys.bookings.all, "list", filters] as const,
    listAll: () => [...queryKeys.bookings.all, "list", "__all__"] as const,
    stats: () => [...queryKeys.bookings.all, "stats"] as const
  },

  reports: {
    all: ["reports"] as const,
    summary: (year: number, month: number) =>
      [...queryKeys.reports.all, "summary", year, month] as const
  },

  menuItems: {
    all: ["menuItems"] as const,
    allGrouped: () => [...queryKeys.menuItems.all, "grouped"] as const,
    byCategory: (category: string) => [...queryKeys.menuItems.all, "category", category] as const
  },

  profile: {
    all: ["profile"] as const,
    caterer: () => [...queryKeys.profile.all, "caterer"] as const,
    dashboard: () => [...queryKeys.profile.all, "dashboard"] as const
  },

  settings: {
    all: ["settings"] as const,
    profile: () => [...queryKeys.settings.all, "profile"] as const,
    packages: () => [...queryKeys.settings.all, "packages"] as const,
    menuItems: () => [...queryKeys.settings.all, "menuItems"] as const
  },

  team: {
    all: ["team"] as const,
    me: () => [...queryKeys.team.all, "me"] as const,
    list: () => [...queryKeys.team.all, "list"] as const
  }
};
