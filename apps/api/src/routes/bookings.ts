import type { Prisma } from "@tripeseats/database";
import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { monthRange, monthRangeFromDate } from "../lib/date-ranges";
import { eventTypeTitle } from "../lib/event-customer-types";
import { parsePagination } from "../lib/pagination";
import { pickBestQuote } from "../lib/quote-pick";
import { getSession, SessionError } from "../lib/session";
import { timer } from "../lib/perf";

const router = Router();

const BOOKING_STATUSES = ["booked", "completed"] as const;
type BookingStatusFilter = (typeof BOOKING_STATUSES)[number] | "all";

function currentMonthRange() {
  return monthRangeFromDate(new Date());
}

function handleSessionError(res: Response, e: unknown) {
  if (e instanceof SessionError) {
    return res.status(e.status).json({ error: e.message });
  }
  console.error("Bookings route error:", e);
  return res.status(500).json({ error: "Internal server error" });
}

const bookingInclude = {
  primaryGuest: true,
  quotes: {
    select: { id: true, totalAmount: true, status: true, updatedAt: true },
    orderBy: { updatedAt: "desc" as const }
  },
  paymentReminders: {
    select: { status: true }
  }
} satisfies Prisma.EventInclude;

/** Authenticated: booking pipeline stats */
router.get("/stats", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const catererId = caterer.id;
    const { start: thisMonthStart, end: thisMonthEnd } = currentMonthRange();

    const [confirmedThisMonth, completedAllTime, eventsThisMonth] = await Promise.all([
      prisma.event.count({
        where: {
          catererId,
          status: "booked",
          eventDate: { gte: thisMonthStart, lte: thisMonthEnd }
        }
      }),
      prisma.event.count({
        where: { catererId, status: "completed" }
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
      })
    ]);

    const revenueThisMonth = eventsThisMonth.reduce((sum, ev) => {
      const quote = pickBestQuote(ev.quotes);
      return sum + (quote?.totalAmount ?? 0);
    }, 0);

    return res.json({ confirmedThisMonth, completedAllTime, revenueThisMonth });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

/** Authenticated: paginated confirmed bookings */
router.get("/", async (req: Request, res: Response) => {
  try {
    const perf = timer("bookings:list");

    const { caterer } = await getSession(req);
    perf.step("session");

    const catererId = caterer.id;

    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const statusParam = String(req.query.status ?? "all").toLowerCase() as BookingStatusFilter;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const monthParam = parseInt(String(req.query.month ?? ""), 10);
    const yearParam = parseInt(String(req.query.year ?? ""), 10);

    const where: Prisma.EventWhereInput = {
      catererId,
      status: { in: ["booked", "completed"] }
    };

    if (statusParam === "booked" || statusParam === "completed") {
      where.status = statusParam;
    }

    const andFilters: Prisma.EventWhereInput[] = [];

    if (search) {
      andFilters.push({
        OR: [
          { venueName: { contains: search, mode: "insensitive" } },
          { venueAddress: { contains: search, mode: "insensitive" } },
          {
            primaryGuest: {
              is: {
                OR: [
                  { firstName: { contains: search, mode: "insensitive" } },
                  { lastName: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } }
                ]
              }
            }
          }
        ]
      });
    }

    if (
      Number.isFinite(monthParam) &&
      monthParam >= 1 &&
      monthParam <= 12 &&
      Number.isFinite(yearParam) &&
      yearParam >= 2000 &&
      yearParam <= 2100
    ) {
      const { start, end } = monthRange(yearParam, monthParam);
      andFilters.push({ eventDate: { gte: start, lte: end } });
    }

    if (andFilters.length) {
      where.AND = andFilters;
    }

    const [total, events] = await Promise.all([
      prisma.event.count({ where }),
      prisma.event.findMany({
        where,
        orderBy: { eventDate: "asc" },
        skip: offset,
        take: pageSize,
        include: bookingInclude
      })
    ]);

    const items = events.map((ev) => {
      const g = ev.primaryGuest;
      const guestName = g ? [g.firstName, g.lastName].filter(Boolean).join(" ") : "—";
      const quote = pickBestQuote(ev.quotes);
      const depositPaid = ev.paymentReminders.some((r) => r.status === "paid");

      return {
        eventId: ev.id,
        guestName,
        guestEmail: g?.email ?? null,
        eventType: ev.eventType,
        eventTypeLabel: eventTypeTitle(ev.eventType),
        customerType: ev.customerType,
        eventDate: ev.eventDate.toISOString(),
        location: ev.venueAddress ?? ev.venueName ?? "—",
        guestCount: ev.guestCountEstimate,
        status: ev.status,
        quoteTotal: quote?.totalAmount ?? null,
        quoteId: quote?.id ?? null,
        depositStatus: depositPaid ? ("paid" as const) : ("pending" as const)
      };
    });

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    perf.step("db:bookings");
    perf.end();
    return res.json({
      items,
      total,
      page,
      pageSize,
      totalPages
    });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

export const bookingsRouter = router;
