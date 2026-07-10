/** Shared API response types — data caching is handled by TanStack Query. */

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
    eventTypeLabel?: string;
    customerType: string;
    eventDate: string;
    startTime: string | null;
    endTime: string | null;
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
    eventTypeLabel?: string;
    customerType: string;
    eventDate: string;
    startTime: string | null;
    endTime: string | null;
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
    eventTypeLabel?: string;
    customerType: string;
    eventDate: string;
    startTime: string | null;
    endTime: string | null;
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
  lost: number;
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
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ConversationsListResponse = {
  conversations: Conversation[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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
  leadReports: Array<{
    eventId: string;
    displayEventId: string;
    bookingDate: string;
    eventDate: string;
    status: string;
    customerName: string;
    phone: string | null;
    email: string | null;
    eventTitle: string;
    location: string;
    eventType: string;
    food: number;
    labor: number;
    delivery: number;
    equipment: number;
    serviceCharges: number;
    discount: number;
    tax: number;
    revenue: number;
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

export type DashboardAllResponse = {
  stats: DashboardStats;
  recent: { items: DashboardRecentRow[] };
  upcoming: { items: DashboardUpcomingRow[] };
};
