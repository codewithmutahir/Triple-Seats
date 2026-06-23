import type { Prisma } from "@tripeseats/database";
import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { getSession, SessionError } from "../lib/session";

const router = Router();

type QuoteStatusValue = "draft" | "sent" | "accepted" | "declined";

const QUOTE_STATUS_PRIORITY: Record<QuoteStatusValue, number> = {
  accepted: 4,
  sent: 3,
  draft: 2,
  declined: 1
};

type QuotePick = { id: string; totalAmount: number; status: QuoteStatusValue; updatedAt: Date };

const EVENT_TYPES = ["Wedding", "Corporate", "Birthday", "Other"] as const;
type EventTypeBucket = (typeof EVENT_TYPES)[number];

function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

function pickBestQuote(quotes: QuotePick[]) {
  const accepted = quotes.filter((q) => q.status === "accepted");
  if (!accepted.length) return null;
  return [...accepted].sort((a, b) => {
    const byStatus = QUOTE_STATUS_PRIORITY[b.status] - QUOTE_STATUS_PRIORITY[a.status];
    if (byStatus !== 0) return byStatus;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  })[0];
}

function categorizeEventType(title: string): EventTypeBucket {
  const t = title.toLowerCase();
  if (t.includes("wedding")) return "Wedding";
  if (t.includes("corporate")) return "Corporate";
  if (t.includes("birthday")) return "Birthday";
  return "Other";
}

function pctGrowth(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

function handleSessionError(res: Response, e: unknown) {
  if (e instanceof SessionError) {
    return res.status(e.status).json({ error: e.message });
  }
  console.error("Reports route error:", e);
  return res.status(500).json({ error: "Internal server error" });
}

function parseYearMonth(req: Request) {
  const now = new Date();
  const yearParam = parseInt(String(req.query.year ?? now.getFullYear()), 10);
  const monthParam = parseInt(String(req.query.month ?? now.getMonth() + 1), 10);
  const year = Number.isFinite(yearParam) ? yearParam : now.getFullYear();
  const month =
    Number.isFinite(monthParam) && monthParam >= 1 && monthParam <= 12
      ? monthParam
      : now.getMonth() + 1;
  return { year, month };
}

async function revenueForEvents(
  catererId: string,
  where: Prisma.EventWhereInput
): Promise<number> {
  const events = await prisma.event.findMany({
    where: { catererId, status: { in: ["booked", "completed"] }, ...where },
    select: {
      quotes: {
        select: { id: true, totalAmount: true, status: true, updatedAt: true }
      }
    }
  });
  return events.reduce((sum, ev) => sum + (pickBestQuote(ev.quotes)?.totalAmount ?? 0), 0);
}

/** Authenticated: business performance summary */
router.get("/summary", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const catererId = caterer.id;
    const { year, month } = parseYearMonth(req);

    const { start: thisStart, end: thisEnd } = monthRange(year, month);
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const { start: lastStart, end: lastEnd } = monthRange(prevYear, prevMonth);

    const [
      allEvents,
      eventsThisMonth,
      eventsLastMonth,
      leadsTotal,
      leadsThisMonth,
      bookedCount,
      recentEvents
    ] = await Promise.all([
      prisma.event.findMany({
        where: { catererId },
        select: { id: true, title: true, status: true, eventDate: true }
      }),
      prisma.event.count({
        where: { catererId, eventDate: { gte: thisStart, lte: thisEnd } }
      }),
      prisma.event.count({
        where: { catererId, eventDate: { gte: lastStart, lte: lastEnd } }
      }),
      prisma.lead.count({ where: { catererId } }),
      prisma.lead.count({
        where: { catererId, createdAt: { gte: thisStart, lte: thisEnd } }
      }),
      prisma.event.count({ where: { catererId, status: { in: ["booked", "completed"] } } }),
      prisma.event.findMany({
        where: { catererId, status: { in: ["booked", "completed"] } },
        orderBy: { eventDate: "desc" },
        take: 10,
        include: {
          primaryGuest: true,
          quotes: {
            select: { id: true, totalAmount: true, status: true, updatedAt: true }
          }
        }
      })
    ]);

    const byStatus = { lead: 0, discussion: 0, booked: 0, completed: 0 };
    const byType: Record<EventTypeBucket, number> = {
      Wedding: 0,
      Corporate: 0,
      Birthday: 0,
      Other: 0
    };
    for (const ev of allEvents) {
      if (ev.status in byStatus) {
        byStatus[ev.status as keyof typeof byStatus] += 1;
      }
      byType[categorizeEventType(ev.title)] += 1;
    }

    const [revenueTotal, revenueThisMonth, revenueLastMonth] = await Promise.all([
      revenueForEvents(catererId, {}),
      revenueForEvents(catererId, { eventDate: { gte: thisStart, lte: thisEnd } }),
      revenueForEvents(catererId, { eventDate: { gte: lastStart, lte: lastEnd } })
    ]);

    const topMonths: Array<{ month: string; revenue: number; events: number }> = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + 1;
      const { start, end } = monthRange(y, m);
      const [rev, evCount] = await Promise.all([
        revenueForEvents(catererId, { eventDate: { gte: start, lte: end } }),
        prisma.event.count({
          where: { catererId, eventDate: { gte: start, lte: end } }
        })
      ]);
      const label = new Intl.DateTimeFormat("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC"
      }).format(start);
      topMonths.push({ month: label, revenue: rev, events: evCount });
    }

    const recentActivity = recentEvents.map((ev) => {
      const g = ev.primaryGuest;
      const guestName = g ? [g.firstName, g.lastName].filter(Boolean).join(" ") : "—";
      const quote = pickBestQuote(ev.quotes);
      return {
        guestName,
        eventType: ev.title,
        eventDate: ev.eventDate.toISOString(),
        revenue: quote?.totalAmount ?? 0,
        status: ev.status
      };
    });

    const conversionRate =
      allEvents.length === 0 ? 0 : Math.round((bookedCount / allEvents.length) * 100);

    return res.json({
      revenue: {
        total: revenueTotal,
        thisMonth: revenueThisMonth,
        lastMonth: revenueLastMonth,
        growth: pctGrowth(revenueThisMonth, revenueLastMonth)
      },
      events: {
        total: allEvents.length,
        thisMonth: eventsThisMonth,
        lastMonth: eventsLastMonth,
        byStatus,
        byType
      },
      leads: {
        total: leadsTotal,
        thisMonth: leadsThisMonth,
        conversionRate
      },
      topMonths,
      recentActivity
    });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

/** Authenticated: last 6 months event counts by status for pipeline chart */
router.get("/events-timeline", async (_req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(_req);
    const catererId = caterer.id;
    const now = new Date();
    const timeline: Array<{
      month: string;
      lead: number;
      discussion: number;
      booked: number;
      completed: number;
    }> = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + 1;
      const { start, end } = monthRange(y, m);
      const monthLabel = new Intl.DateTimeFormat("en-US", {
        month: "short",
        timeZone: "UTC"
      }).format(start);

      const [lead, discussion, booked, completed] = await Promise.all([
        prisma.event.count({
          where: { catererId, status: "lead", eventDate: { gte: start, lte: end } }
        }),
        prisma.event.count({
          where: { catererId, status: "discussion", eventDate: { gte: start, lte: end } }
        }),
        prisma.event.count({
          where: { catererId, status: "booked", eventDate: { gte: start, lte: end } }
        }),
        prisma.event.count({
          where: { catererId, status: "completed", eventDate: { gte: start, lte: end } }
        })
      ]);

      timeline.push({ month: monthLabel, lead, discussion, booked, completed });
    }

    return res.json(timeline);
  } catch (e) {
    return handleSessionError(res, e);
  }
});

export const reportsRouter = router;
