import type { Prisma } from "@tripeseats/database";
import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { monthRange, previousMonthRange } from "../lib/date-ranges";
import { breakdownQuoteLineItems } from "../lib/quote-breakdown";
import { pickBestQuote } from "../lib/quote-pick";
import { getAuthorizedSession } from "../lib/authorized-session";
import { handleRouteError } from "../lib/route-errors";

const router = Router();

const EVENT_TYPES = ["Wedding", "Corporate", "Birthday", "Other"] as const;
type EventTypeBucket = (typeof EVENT_TYPES)[number];

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

function displayEventId(eventId: string) {
  const digits = eventId.replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  return eventId.slice(-6).toUpperCase();
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
    const { caterer } = await getAuthorizedSession(req, "reports:read");
    const catererId = caterer.id;
    const { year, month } = parseYearMonth(req);

    const { start: thisStart, end: thisEnd } = monthRange(year, month);
    const { start: lastStart, end: lastEnd } = previousMonthRange(year, month);

    const [
      allEvents,
      eventsThisMonth,
      eventsLastMonth,
      leadsTotal,
      leadsThisMonth,
      bookedCount,
      monthEvents
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
        where: { catererId, eventDate: { gte: thisStart, lte: thisEnd } },
        orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
        include: {
          primaryGuest: true,
          lead: {
            select: {
              id: true,
              contactEmail: true,
              createdAt: true,
              title: true
            }
          },
          quotes: {
            select: {
              id: true,
              totalAmount: true,
              status: true,
              updatedAt: true,
              taxRate: true,
              lineItems: {
                select: {
                  category: true,
                  name: true,
                  unitPrice: true,
                  quantity: true,
                  unitType: true,
                  appliedTier: true
                }
              }
            },
            orderBy: { updatedAt: "desc" }
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
    const anchor = new Date(year, month - 1, 1);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const { start, end } = monthRange(y, m);
      const [rev, evCount] = await Promise.all([
        revenueForEvents(catererId, { eventDate: { gte: start, lte: end } }),
        prisma.event.count({
          where: { catererId, eventDate: { gte: start, lte: end } }
        })
      ]);
      const label = new Intl.DateTimeFormat("en-US", {
        month: "short",
        year: "numeric"
      }).format(start);
      topMonths.push({ month: label, revenue: rev, events: evCount });
    }

    const leadReports = monthEvents.map((ev) => {
      const guest = ev.primaryGuest;
      const guestName = guest
        ? [guest.firstName, guest.lastName].filter(Boolean).join(" ")
        : "—";
      const email = guest?.email ?? ev.lead?.contactEmail ?? null;
      const phone = guest?.phone ?? null;
      const quote = pickBestQuote(ev.quotes);
      const guestCount = ev.guestCountEstimate ?? 0;
      const breakdown = quote
        ? breakdownQuoteLineItems(quote.lineItems, quote.taxRate, guestCount)
        : {
            food: 0,
            labor: 0,
            delivery: 0,
            equipment: 0,
            serviceCharges: 0,
            discount: 0,
            tax: 0,
            total: 0
          };

      return {
        eventId: ev.id,
        displayEventId: displayEventId(ev.id),
        bookingDate: (ev.lead?.createdAt ?? ev.createdAt).toISOString(),
        eventDate: ev.eventDate.toISOString(),
        status: ev.status,
        customerName: guestName,
        phone,
        email,
        eventTitle: ev.title,
        location: ev.venueAddress ?? ev.venueName ?? "—",
        eventType: categorizeEventType(ev.title),
        food: breakdown.food,
        labor: breakdown.labor,
        delivery: breakdown.delivery,
        equipment: breakdown.equipment,
        serviceCharges: breakdown.serviceCharges,
        discount: breakdown.discount,
        tax: breakdown.tax,
        revenue: quote?.totalAmount ?? breakdown.total
      };
    });

    const recentActivity = leadReports
      .filter((row) => row.status === "booked" || row.status === "completed")
      .slice(0, 10)
      .map((row) => ({
        guestName: row.customerName,
        eventType: row.eventTitle,
        eventDate: row.eventDate,
        revenue: row.revenue,
        status: row.status
      }));

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
      recentActivity,
      leadReports
    });
  } catch (e) {
    return handleRouteError(res, e, "Reports");
  }
});

/** Authenticated: last 6 months event counts by status for pipeline chart */
router.get("/events-timeline", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "reports:read");
    const catererId = caterer.id;
    const { year, month } = parseYearMonth(req);
    const anchor = new Date(year, month - 1, 1);

    const timeline: Array<{
      month: string;
      lead: number;
      discussion: number;
      booked: number;
      completed: number;
    }> = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const { start, end } = monthRange(y, m);
      const monthLabel = new Intl.DateTimeFormat("en-US", { month: "short" }).format(start);

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
    return handleRouteError(res, e, "Reports");
  }
});

export const reportsRouter = router;
