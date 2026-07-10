import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { getAuthorizedSession } from "../lib/authorized-session";
import { handleRouteError } from "../lib/route-errors";
import { timer } from "../lib/perf";

const router = Router();

type CalendarEventItem = {
  id: string;
  title: string;
  start: string;
  status: string;
  guestName: string | undefined;
  location: string | null;
  guestCount: number | null;
  color: string;
  eventTitle: string;
  startTime: string | null;
  endTime: string | null;
  hasQuote: boolean;
};

const calCache = new Map<string, { data: CalendarEventItem[]; ts: number }>();
const CAL_TTL = 60_000;
const MAX_RANGE_MS = 93 * 24 * 60 * 60 * 1000;

const STATUS_COLORS: Record<string, string> = {
  lead: "#F59E0B",
  discussion: "#3B82F6",
  booked: "#10B981",
  completed: "#6B7280",
  lost: "#EF4444"
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addMonths(d: Date, months: number) {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

function subMonths(d: Date, months: number) {
  return addMonths(d, -months);
}

function getFreshCacheEntry(cacheKey: string) {
  const cached = calCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.ts < CAL_TTL) return cached;
  calCache.delete(cacheKey);
  return null;
}

function guestDisplayName(
  guest: { firstName: string; lastName: string | null } | null
): string | undefined {
  if (!guest) return undefined;
  const name = [guest.firstName, guest.lastName].filter(Boolean).join(" ");
  return name || undefined;
}

type EventRow = {
  id: string;
  title: string;
  eventDate: Date;
  status: string;
  venueAddress: string | null;
  venueName: string | null;
  guestCountEstimate: number | null;
  startTime: Date | null;
  endTime: Date | null;
  primaryGuest: { firstName: string; lastName: string | null } | null;
  _count: { quotes: number };
};

/** Calendar day for placement — use UTC date portion so Jul 28 stays Jul 28 in every TZ. */
function calendarDayFromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mapEventsToCalendarItems(events: EventRow[]): CalendarEventItem[] {
  return events.map((ev) => {
    const guestName = guestDisplayName(ev.primaryGuest);
    const title = guestName ? `${ev.title} — ${guestName}` : ev.title;

    return {
      id: ev.id,
      title,
      start: calendarDayFromDate(ev.eventDate),
      status: ev.status,
      guestName,
      location: ev.venueAddress ?? ev.venueName ?? null,
      guestCount: ev.guestCountEstimate,
      color: STATUS_COLORS[ev.status] ?? STATUS_COLORS.lead,
      eventTitle: ev.title,
      startTime: ev.startTime?.toISOString() ?? null,
      endTime: ev.endTime?.toISOString() ?? null,
      hasQuote: ev._count.quotes > 0
    };
  });
}

const eventSelect = {
  id: true,
  title: true,
  eventDate: true,
  status: true,
  venueAddress: true,
  venueName: true,
  guestCountEstimate: true,
  startTime: true,
  endTime: true,
  primaryGuest: {
    select: { firstName: true, lastName: true }
  },
  _count: { select: { quotes: true } }
} as const;

async function fetchEventsInRange(catererId: string, start: Date, end: Date) {
  return prisma.event.findMany({
    where: {
      catererId,
      eventDate: { gte: start, lte: end }
    },
    select: eventSelect,
    orderBy: { eventDate: "asc" }
  });
}


/** Combined init — prev, current, and next month in one request */
router.get("/init", async (req: Request, res: Response) => {
  try {
    const perf = timer("calendar:init");

    const { caterer } = await getAuthorizedSession(req, "events:read");
    perf.step("session");

    const now = new Date();
    const ranges = [
      { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) },
      { start: startOfMonth(now), end: endOfMonth(now) },
      { start: startOfMonth(addMonths(now, 1)), end: endOfMonth(addMonths(now, 1)) }
    ];

    const cacheKey = `init:${caterer.id}:${ranges.map((r) => r.start.toISOString()).join(":")}`;
    const cached = getFreshCacheEntry(cacheKey);
    if (cached) {
      perf.step("db:parallel-all");
      perf.end();
      return res.json({ events: cached.data });
    }

    const [prevEvents, currEvents, nextEvents] = await Promise.all(
      ranges.map(({ start, end }) => fetchEventsInRange(caterer.id, start, end))
    );

    const items = mapEventsToCalendarItems([...prevEvents, ...currEvents, ...nextEvents]);
    calCache.set(cacheKey, { data: items, ts: Date.now() });

    perf.step("db:parallel-all");
    perf.end();
    return res.json({ events: items });
  } catch (e) {
    return handleRouteError(res, e, "Calendar");
  }
});

router.get("/events", async (req: Request, res: Response) => {
  try {
    const perf = timer("calendar:events");

    const { caterer } = await getAuthorizedSession(req, "events:read");
    perf.step("session");

    const startRaw = req.query.start;
    const endRaw = req.query.end;

    if (typeof startRaw !== "string" || typeof endRaw !== "string") {
      return res.status(400).json({ error: "start and end query params are required." });
    }

    const start = new Date(startRaw);
    const end = new Date(endRaw);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ error: "Invalid start or end date." });
    }
    if (start >= end) {
      return res.status(400).json({ error: "start must be before end." });
    }
    if (end.getTime() - start.getTime() > MAX_RANGE_MS) {
      return res.status(400).json({ error: "Date range exceeds the maximum allowed span." });
    }

    const cacheKey = `${caterer.id}:${startRaw}:${endRaw}`;
    const cached = getFreshCacheEntry(cacheKey);
    if (cached) {
      perf.step("db:events");
      perf.end();
      return res.json(cached.data);
    }

    const events = await fetchEventsInRange(caterer.id, start, end);
    const items = mapEventsToCalendarItems(events);

    calCache.set(cacheKey, { data: items, ts: Date.now() });
    perf.step("db:events");
    perf.end();
    return res.json(items);
  } catch (e) {
    return handleRouteError(res, e, "Calendar");
  }
});

export const calendarRouter = router;

