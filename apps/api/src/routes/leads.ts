import type { Prisma } from "@tripeseats/database";
import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { getIntakeCatererId } from "../lib/intake-caterer";
import { CatererResolveError, resolveLeadCatererId } from "../lib/caterer-resolver";
import {
  eventTypeTitle,
  isCustomerType,
  isEventType,
  type CustomerTypeValue,
  type EventTypeValue
} from "../lib/event-customer-types";
import { combineDateAndTime, formatTimeRange, parseTimeString } from "../lib/event-datetime";
import { escapeHtml, getResend, resendFromEmail } from "../lib/mail";
import { leadFormLimiter } from "../lib/rate-limit";
import { parsePagination } from "../lib/pagination";
import { getSession, SessionError } from "../lib/session";
import { timer } from "../lib/perf";

const router = Router();

const EVENT_STATUSES = ["lead", "discussion", "booked", "completed"] as const;
type EventStatusFilter = (typeof EVENT_STATUSES)[number];

type LeadPayload = {
  guestName: string;
  contactNumber: string;
  email: string;
  eventType: EventTypeValue;
  customerType: CustomerTypeValue;
  eventLocation: string;
  eventDate: string;
  eventStartTime: string;
  eventEndTime?: string;
  numberOfGuests: number;
  preferredTimeSlots: string[];
  additionalNotes?: string;
  catererSlug?: string;
};

function parsePayload(body: unknown): LeadPayload | null {
  const value = body as Partial<LeadPayload>;
  if (
    !value ||
    typeof value.guestName !== "string" ||
    typeof value.contactNumber !== "string" ||
    typeof value.email !== "string" ||
    typeof value.eventType !== "string" ||
    typeof value.eventLocation !== "string" ||
    typeof value.eventDate !== "string" ||
    typeof value.eventStartTime !== "string" ||
    typeof value.numberOfGuests !== "number" ||
    !Array.isArray(value.preferredTimeSlots)
  ) {
    return null;
  }

  const additionalNotes =
    typeof value.additionalNotes === "string" ? value.additionalNotes.trim() : undefined;
  const catererSlug =
    typeof value.catererSlug === "string" ? value.catererSlug.trim().toLowerCase() : undefined;
  const customerTypeRaw =
    typeof value.customerType === "string" ? value.customerType.trim().toLowerCase() : "b2c";
  const customerType: CustomerTypeValue = isCustomerType(customerTypeRaw) ? customerTypeRaw : "b2c";
  const eventTypeRaw =
    typeof value.eventType === "string" ? value.eventType.trim().toLowerCase() : "";

  const eventEndTimeRaw =
    typeof value.eventEndTime === "string" ? value.eventEndTime.trim() : undefined;

  if (!isEventType(eventTypeRaw)) {
    return null;
  }

  if (!parseTimeString(value.eventStartTime)) {
    return null;
  }

  if (eventEndTimeRaw && !parseTimeString(eventEndTimeRaw)) {
    return null;
  }

  const payload: LeadPayload = {
    guestName: value.guestName.trim(),
    contactNumber: value.contactNumber.trim(),
    email: value.email.trim(),
    eventType: eventTypeRaw,
    customerType,
    eventLocation: value.eventLocation.trim(),
    eventDate: value.eventDate,
    eventStartTime: value.eventStartTime.trim(),
    numberOfGuests: value.numberOfGuests,
    preferredTimeSlots: value.preferredTimeSlots
      .filter((slot): slot is string => typeof slot === "string" && slot.trim().length > 0)
      .map((slot) => slot.trim()),
    ...(eventEndTimeRaw ? { eventEndTime: eventEndTimeRaw } : {}),
    ...(additionalNotes ? { additionalNotes } : {}),
    ...(catererSlug ? { catererSlug } : {})
  };

  const parsedDate = new Date(payload.eventDate);
  if (
    !payload.guestName ||
    !payload.contactNumber ||
    !payload.email ||
    !payload.eventType ||
    !payload.eventLocation ||
    !payload.eventStartTime ||
    Number.isNaN(parsedDate.getTime()) ||
    payload.numberOfGuests <= 0
  ) {
    return null;
  }

  const startTime = combineDateAndTime(parsedDate, payload.eventStartTime);
  if (!startTime) return null;

  if (payload.eventEndTime) {
    const endTime = combineDateAndTime(parsedDate, payload.eventEndTime);
    if (!endTime || endTime.getTime() <= startTime.getTime()) {
      return null;
    }
  }

  return payload;
}

function handleSessionError(res: Response, e: unknown) {
  if (e instanceof SessionError) {
    return res.status(e.status).json({ error: e.message });
  }
  console.error("Leads route error:", e);
  return res.status(500).json({ error: "Internal server error" });
}

function isMissingLeadContactEmailColumn(e: unknown): boolean {
  if (!e || typeof e !== "object" || !("code" in e)) return false;
  if ((e as { code: string }).code !== "P2022") return false;
  const col = (e as { meta?: { column?: string } }).meta?.column ?? "";
  return col.includes("contactEmail");
}

/** Public: submit lead from marketing site */
router.post("/", leadFormLimiter, async (req: Request, res: Response) => {
  const payload = parsePayload(req.body);
  if (!payload) {
    return res.status(400).json({ error: "Invalid lead payload." });
  }

  const resend = getResend();

  try {
    let catererId: string;
    try {
      catererId = await resolveLeadCatererId(payload.catererSlug);
    } catch (configErr) {
      if (configErr instanceof CatererResolveError) {
        return res.status(configErr.status).json({ error: configErr.message });
      }
      console.error("Lead intake configuration:", configErr);
      return res.status(503).json({
        error: "This booking page isn't available right now. Please try again later."
      });
    }
    const [firstName, ...lastNameParts] = payload.guestName.split(" ").filter(Boolean);
    const lastName = lastNameParts.join(" ") || null;
    const eventDate = new Date(payload.eventDate);
    const startTime = combineDateAndTime(eventDate, payload.eventStartTime)!;
    const endTime = payload.eventEndTime
      ? combineDateAndTime(eventDate, payload.eventEndTime)
      : null;
    const preferredSlots = payload.preferredTimeSlots.join(", ");
    const eventTimeLabel = formatTimeRange(startTime, endTime);
    const notesExtra = payload.additionalNotes
      ? `\nAdditional notes: ${payload.additionalNotes}`
      : "";
    const eventNotesBase = `Event time: ${eventTimeLabel}\nPreferred time slots: ${preferredSlots || "Not provided"}`;
    const leadNotesBase = `${eventNotesBase}\nEvent location: ${payload.eventLocation}`;

    const insertBundle = async (tx: Prisma.TransactionClient, storeContactEmail: boolean) => {
      const guest = await tx.guest.upsert({
        where: {
          catererId_email: {
            catererId,
            email: payload.email
          }
        },
        create: {
          catererId,
          firstName: firstName ?? payload.guestName,
          lastName,
          email: payload.email,
          phone: payload.contactNumber
        },
        update: {
          firstName: firstName ?? payload.guestName,
          lastName,
          phone: payload.contactNumber
        }
      });

      const createdLead = await tx.lead.create({
        data: {
          catererId,
          guestId: guest.id,
          ...(storeContactEmail ? { contactEmail: payload.email } : {}),
          source: "public_form",
          title: eventTypeTitle(payload.eventType),
          customerType: payload.customerType,
          notes: `${leadNotesBase}${notesExtra}`,
          estimatedGuests: payload.numberOfGuests,
          expectedEventAt: eventDate
        }
      });

      await tx.event.create({
        data: {
          catererId,
          leadId: createdLead.id,
          primaryGuestId: guest.id,
          title: eventTypeTitle(payload.eventType),
          eventType: payload.eventType,
          customerType: payload.customerType,
          status: "lead",
          eventDate,
          startTime,
          ...(endTime ? { endTime } : {}),
          venueAddress: payload.eventLocation,
          guestCountEstimate: payload.numberOfGuests,
          notes: `${eventNotesBase}${notesExtra}`
        }
      });

      return createdLead;
    };

    let lead;
    try {
      lead = await prisma.$transaction((tx) => insertBundle(tx, true));
    } catch (firstErr) {
      if (isMissingLeadContactEmailColumn(firstErr)) {
        console.warn(
          "[leads POST] leads.contactEmail column missing — retrying without it. Run prisma migrate deploy (migration 20260513210000_lead_contact_email)."
        );
        lead = await prisma.$transaction((tx) => insertBundle(tx, false));
      } else {
        throw firstErr;
      }
    }

    if (resend) {
      await resend.emails.send({
        from: resendFromEmail(),
        to: payload.email,
        subject: "We received your catering inquiry",
        html: `<p>Hi ${escapeHtml(payload.guestName)},</p>
               <p>Thanks for your inquiry for <strong>${escapeHtml(eventTypeTitle(payload.eventType))}</strong> on <strong>${escapeHtml(eventDate.toDateString())}</strong>.</p>
               <p>Location: ${escapeHtml(payload.eventLocation)}<br/>Guests: ${payload.numberOfGuests}<br/>Event time: ${escapeHtml(eventTimeLabel)}<br/>Preferred slots: ${escapeHtml(preferredSlots || "Not provided")}</p>
               <p>Our team will contact you shortly.</p>`
      });
    }

    return res.status(201).json({
      ok: true,
      leadId: lead.id,
      emailSent: Boolean(resend)
    });
  } catch (error) {
    console.error("Lead creation failed:", error);
    return res.status(500).json({ error: "Unable to submit lead right now." });
  }
});


/** Authenticated: paginated events (lead pipeline) for dashboard */
router.get("/", async (req: Request, res: Response) => {
  try {
    const perf = timer("leads:list");

    const { caterer } = await getSession(req);
    perf.step("session");

    const catererId = caterer.id;
    const intakeCatererId = process.env.LEAD_INTAKE_CATERER_ID?.trim();

    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const statusParam = String(req.query.status ?? "all").toLowerCase();
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom.trim() : "";
    const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo.trim() : "";

    const where: Prisma.EventWhereInput = { catererId };

    if (statusParam !== "all" && EVENT_STATUSES.includes(statusParam as EventStatusFilter)) {
      where.status = statusParam as EventStatusFilter;
    }

    const andFilters: Prisma.EventWhereInput[] = [];

    if (search) {
      andFilters.push({
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          {
            primaryGuest: {
              is: {
                OR: [
                  { firstName: { contains: search, mode: "insensitive" } },
                  { lastName: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } },
                  { phone: { contains: search, mode: "insensitive" } }
                ]
              }
            }
          }
        ]
      });
    }

    if (dateFrom || dateTo) {
      const range: Prisma.DateTimeFilter = {};
      if (dateFrom) {
        const d = new Date(`${dateFrom}T00:00:00.000Z`);
        if (!Number.isNaN(d.getTime())) range.gte = d;
      }
      if (dateTo) {
        const d = new Date(`${dateTo}T23:59:59.999Z`);
        if (!Number.isNaN(d.getTime())) range.lte = d;
      }
      if (Object.keys(range).length) {
        andFilters.push({ eventDate: range });
      }
    }

    if (andFilters.length) {
      where.AND = andFilters;
    }

    const start = Date.now();
    const [total, events] = await Promise.all([
      prisma.event.count({ where }),
      prisma.event.findMany({
        where,
        select: {
          id: true,
          leadId: true,
          title: true,
          status: true,
          eventType: true,
          customerType: true,
          eventDate: true,
          startTime: true,
          endTime: true,
          venueAddress: true,
          venueName: true,
          guestCountEstimate: true,
          createdAt: true,
          primaryGuest: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          }
        },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: pageSize
      })
    ]);
    perf.step("db:count");
    perf.step("db:findMany");
    console.log(`[leads] query took ${Date.now() - start}ms (caterer=${catererId}, page=${page})`);

    const items = events.map((ev) => {
      const g = ev.primaryGuest;
      const guestName = g ? [g.firstName, g.lastName].filter(Boolean).join(" ") : "—";
      return {
        id: ev.id,
        leadId: ev.leadId,
        guestName,
        guestEmail: g?.email ?? null,
        contactNumber: g?.phone ?? null,
        eventType: ev.eventType,
        eventTypeLabel: eventTypeTitle(ev.eventType),
        customerType: ev.customerType,
        eventDate: ev.eventDate.toISOString(),
        startTime: ev.startTime?.toISOString() ?? null,
        endTime: ev.endTime?.toISOString() ?? null,
        location: ev.venueAddress ?? ev.venueName ?? "—",
        guestCount: ev.guestCountEstimate,
        status: ev.status
      };
    });

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    let intakeMismatchWarning: string | undefined;
    if (
      total === 0 &&
      intakeCatererId &&
      intakeCatererId !== catererId
    ) {
      const intakeLeadCount = await prisma.lead.count({
        where: { catererId: intakeCatererId }
      });
      if (intakeLeadCount > 0) {
        intakeMismatchWarning =
          "Inquiries from your public booking page may be saved under a different account. " +
          "Sign in with the email tied to your business, or contact support for help.";
      }
    }

    perf.end();
    return res.json({
      items,
      total,
      page,
      pageSize,
      totalPages,
      ...(intakeMismatchWarning ? { intakeMismatchWarning } : {})
    });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

export const leadsRouter = router;
