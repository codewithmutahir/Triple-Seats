import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { getSession, SessionError } from "../lib/session";

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

function getFreshCacheEntry(cacheKey: string) {
  const cached = calCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.ts < CAL_TTL) return cached;
  calCache.delete(cacheKey);
  return null;
}

const STATUS_COLORS: Record<string, string> = {
  lead: "#F59E0B",
  discussion: "#3B82F6",
  booked: "#10B981",
  completed: "#6B7280"
};

function guestDisplayName(
  guest: { firstName: string; lastName: string | null } | null
): string | undefined {
  if (!guest) return undefined;
  const name = [guest.firstName, guest.lastName].filter(Boolean).join(" ");
  return name || undefined;
}

function handleSessionError(res: Response, e: unknown) {
  if (e instanceof SessionError) {
    return res.status(e.status).json({ error: e.message });
  }
  console.error("Calendar route error:", e);
  return res.status(500).json({ error: "Internal server error" });
}

router.get("/events", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
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
      return res.json(cached.data);
    }

    const events = await prisma.event.findMany({
      where: {
        catererId: caterer.id,
        eventDate: { gte: start, lte: end }
      },
      include: {
        primaryGuest: true,
        _count: { select: { quotes: true } }
      },
      orderBy: { eventDate: "asc" }
    });

    const items: CalendarEventItem[] = events.map((ev) => {
      const guestName = guestDisplayName(ev.primaryGuest);
      const title = guestName ? `${ev.title} — ${guestName}` : ev.title;

      return {
        id: ev.id,
        title,
        start: ev.eventDate.toISOString(),
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

    calCache.set(cacheKey, { data: items, ts: Date.now() });
    return res.json(items);
  } catch (e) {
    return handleSessionError(res, e);
  }
});

export const calendarRouter = router;
