import { Router, type Request, type Response } from "express";

import { getCatererPublicProfile } from "./caterers";
import { monthRangeFromDate, previousMonthRange } from "../lib/date-ranges";
import { eventTypeTitle } from "../lib/event-customer-types";
import { pickBestQuote } from "../lib/quote-pick";
import { getSession, SessionError } from "../lib/session";
import { timer } from "../lib/perf";
import { prisma } from "@tripeseats/database";

const router = Router();

type StatsPayload = {
  leads: { count: number; trend: string };
  bookings: { count: number; trend: string };
  upcomingEvents: { count: number; trend: string };
  revenue: { amount: number; trend: string };
};

const statsCache = new Map<string, { data: StatsPayload; ts: number }>();
const CACHE_TTL = 60_000;

function pctTrend(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "No change" : "New this period";
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "Flat vs last month";
  return `${pct > 0 ? "+" : ""}${pct}% vs last month`;
}

function handleSessionError(res: Response, e: unknown) {
  if (e instanceof SessionError) {
    return res.status(e.status).json({ error: e.message });
  }
  console.error("Dashboard route error:", e);
  return res.status(500).json({ error: "Internal server error" });
}

async function computeDashboardStats(catererId: string): Promise<StatsPayload> {
  const cached = statsCache.get(catererId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  const now = new Date();
  const { start: thisMonthStart, end: thisMonthEnd } = monthRangeFromDate(now);
  const { start: prevStart, end: prevEnd } = previousMonthRange(
    now.getFullYear(),
    now.getMonth() + 1
  );

  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 7);
  dayEnd.setHours(23, 59, 59, 999);

  const prevWindowStart = new Date(dayStart);
  prevWindowStart.setDate(prevWindowStart.getDate() - 7);

  const [
    leadsThisMonth,
    leadsPrevMonth,
    bookingsThisMonth,
    bookingsPrevMonth,
    upcomingEventsCount,
    upcomingPrevWindow,
    revenueAgg,
    revenuePrevAgg
  ] = await Promise.all([
    prisma.lead.count({
      where: { catererId, createdAt: { gte: thisMonthStart, lte: thisMonthEnd } }
    }),
    prisma.lead.count({
      where: { catererId, createdAt: { gte: prevStart, lte: prevEnd } }
    }),
    prisma.event.count({
      where: {
        catererId,
        status: "booked",
        eventDate: { gte: thisMonthStart, lte: thisMonthEnd }
      }
    }),
    prisma.event.count({
      where: {
        catererId,
        status: "booked",
        eventDate: { gte: prevStart, lte: prevEnd }
      }
    }),
    prisma.event.count({
      where: {
        catererId,
        eventDate: { gte: dayStart, lte: dayEnd }
      }
    }),
    prisma.event.count({
      where: {
        catererId,
        eventDate: {
          gte: prevWindowStart,
          lt: dayStart
        }
      }
    }),
    prisma.event.findMany({
      where: {
        catererId,
        status: { in: ["booked", "completed"] },
        eventDate: { gte: thisMonthStart, lte: thisMonthEnd }
      },
      select: {
        quotes: {
          select: { id: true, totalAmount: true, status: true, updatedAt: true }
        }
      }
    }),
    prisma.event.findMany({
      where: {
        catererId,
        status: { in: ["booked", "completed"] },
        eventDate: { gte: prevStart, lte: prevEnd }
      },
      select: {
        quotes: {
          select: { id: true, totalAmount: true, status: true, updatedAt: true }
        }
      }
    })
  ]);

  const revenue = revenueAgg.reduce(
    (sum, ev) => sum + (pickBestQuote(ev.quotes)?.totalAmount ?? 0),
    0
  );
  const revenuePrev = revenuePrevAgg.reduce(
    (sum, ev) => sum + (pickBestQuote(ev.quotes)?.totalAmount ?? 0),
    0
  );

  const result: StatsPayload = {
    leads: {
      count: leadsThisMonth,
      trend: pctTrend(leadsThisMonth, leadsPrevMonth)
    },
    bookings: {
      count: bookingsThisMonth,
      trend: pctTrend(bookingsThisMonth, bookingsPrevMonth)
    },
    upcomingEvents: {
      count: upcomingEventsCount,
      trend: pctTrend(upcomingEventsCount, upcomingPrevWindow)
    },
    revenue: {
      amount: revenue,
      trend: pctTrend(Math.round(revenue), Math.round(revenuePrev))
    }
  };

  statsCache.set(catererId, { data: result, ts: Date.now() });
  return result;
}

async function fetchRecentLeads(catererId: string) {
  const events = await prisma.event.findMany({
    where: { catererId },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      primaryGuest: true,
      lead: {
        select: {
          contactEmail: true,
          title: true,
          notes: true
        }
      }
    }
  });

  return events.map((ev) => {
    const guest = ev.primaryGuest;
    const guestName = guest
      ? [guest.firstName, guest.lastName].filter(Boolean).join(" ")
      : "Unknown guest";
    return {
      id: ev.id,
      guestName,
      eventType: ev.eventType,
      eventTypeLabel: eventTypeTitle(ev.eventType),
      date: ev.eventDate.toISOString(),
      location: ev.venueAddress ?? ev.venueName ?? "—",
      guestCount: ev.guestCountEstimate,
      status: ev.status
    };
  });
}

async function fetchUpcomingEvents(catererId: string) {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 7);
  dayEnd.setHours(23, 59, 59, 999);

  const list = await prisma.event.findMany({
    where: {
      catererId,
      eventDate: { gte: dayStart, lte: dayEnd }
    },
    orderBy: { eventDate: "asc" },
    select: {
      id: true,
      title: true,
      eventDate: true,
      venueAddress: true,
      venueName: true,
      guestCountEstimate: true
    }
  });

  return list.map((e) => ({
    id: e.id,
    title: e.title,
    date: e.eventDate.toISOString(),
    venue: e.venueAddress ?? e.venueName ?? "—",
    guestCount: e.guestCountEstimate
  }));
}

router.get("/profile", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const profile = await getCatererPublicProfile(caterer);
    return res.json(profile);
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.get("/stats", async (req: Request, res: Response) => {
  try {
    const perf = timer("dashboard:stats");

    const { caterer } = await getSession(req);
    perf.step("session");

    const result = await computeDashboardStats(caterer.id);
    perf.step("db:stats-queries");
    perf.end();
    return res.json(result);
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.get("/all", async (req: Request, res: Response) => {
  try {
    const perf = timer("dashboard:all");

    const { caterer } = await getSession(req);
    perf.step("session");

    const [stats, recent, upcoming] = await Promise.all([
      computeDashboardStats(caterer.id),
      fetchRecentLeads(caterer.id),
      fetchUpcomingEvents(caterer.id)
    ]);

    perf.step("db:parallel-all");
    perf.end();

    return res.json({
      stats,
      recent: { items: recent },
      upcoming: { items: upcoming }
    });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.get("/recent-leads", async (req: Request, res: Response) => {
  try {
    const perf = timer("dashboard:recent");

    const { caterer } = await getSession(req);
    perf.step("session");

    const items = await fetchRecentLeads(caterer.id);

    perf.step("db:recent");
    perf.end();
    return res.json({ items });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.get("/upcoming-events", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const items = await fetchUpcomingEvents(caterer.id);
    return res.json({ items });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

export const dashboardRouter = router;
