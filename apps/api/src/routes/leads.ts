import type { Prisma } from "@tripeseats/database";
import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { getIntakeCatererId } from "../lib/intake-caterer";
import { getResend, resendFromEmail } from "../lib/mail";
import { getSession, SessionError } from "../lib/session";

const router = Router();

const EVENT_STATUSES = ["lead", "discussion", "booked", "completed"] as const;
type EventStatusFilter = (typeof EVENT_STATUSES)[number];

type LeadPayload = {
  guestName: string;
  contactNumber: string;
  email: string;
  eventType: string;
  eventLocation: string;
  eventDate: string;
  numberOfGuests: number;
  preferredTimeSlots: string[];
  additionalNotes?: string;
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
    typeof value.numberOfGuests !== "number" ||
    !Array.isArray(value.preferredTimeSlots)
  ) {
    return null;
  }

  const additionalNotes =
    typeof value.additionalNotes === "string" ? value.additionalNotes.trim() : undefined;

  const payload: LeadPayload = {
    guestName: value.guestName.trim(),
    contactNumber: value.contactNumber.trim(),
    email: value.email.trim(),
    eventType: value.eventType.trim(),
    eventLocation: value.eventLocation.trim(),
    eventDate: value.eventDate,
    numberOfGuests: value.numberOfGuests,
    preferredTimeSlots: value.preferredTimeSlots
      .filter((slot): slot is string => typeof slot === "string" && slot.trim().length > 0)
      .map((slot) => slot.trim()),
    ...(additionalNotes ? { additionalNotes } : {})
  };

  const parsedDate = new Date(payload.eventDate);
  if (
    !payload.guestName ||
    !payload.contactNumber ||
    !payload.email ||
    !payload.eventType ||
    !payload.eventLocation ||
    Number.isNaN(parsedDate.getTime()) ||
    payload.numberOfGuests <= 0
  ) {
    return null;
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
router.post("/", async (req: Request, res: Response) => {
  const payload = parsePayload(req.body);
  if (!payload) {
    return res.status(400).json({ error: "Invalid lead payload." });
  }

  const resend = getResend();

  try {
    let catererId: string;
    try {
      catererId = await getIntakeCatererId();
    } catch (configErr) {
      console.error("Lead intake configuration:", configErr);
      return res.status(503).json({
        error:
          "Lead intake is not configured. Set LEAD_INTAKE_CATERER_ID to your caterer ID (see apps/api/.env.example)."
      });
    }
    const [firstName, ...lastNameParts] = payload.guestName.split(" ").filter(Boolean);
    const lastName = lastNameParts.join(" ") || null;
    const eventDate = new Date(payload.eventDate);
    const preferredSlots = payload.preferredTimeSlots.join(", ");
    const notesExtra = payload.additionalNotes
      ? `\nAdditional notes: ${payload.additionalNotes}`
      : "";

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
          title: payload.eventType,
          notes: `Preferred time slots: ${preferredSlots || "Not provided"}\nEvent location: ${payload.eventLocation}${notesExtra}`,
          estimatedGuests: payload.numberOfGuests,
          expectedEventAt: eventDate
        }
      });

      await tx.event.create({
        data: {
          catererId,
          leadId: createdLead.id,
          primaryGuestId: guest.id,
          title: payload.eventType,
          status: "lead",
          eventDate,
          venueAddress: payload.eventLocation,
          guestCountEstimate: payload.numberOfGuests,
          notes: `Preferred time slots: ${preferredSlots || "Not provided"}${notesExtra}`
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
        html: `<p>Hi ${payload.guestName},</p>
               <p>Thanks for your inquiry for <strong>${payload.eventType}</strong> on <strong>${eventDate.toDateString()}</strong>.</p>
               <p>Location: ${payload.eventLocation}<br/>Guests: ${payload.numberOfGuests}<br/>Preferred slots: ${preferredSlots || "Not provided"}</p>
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

const eventListInclude = {
  primaryGuest: true,
  lead: {
    select: {
      contactEmail: true,
      title: true,
      notes: true
    }
  }
} satisfies Prisma.EventInclude;

/** Authenticated: paginated events (lead pipeline) for dashboard */
router.get("/", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const catererId = caterer.id;
    const intakeCatererId = process.env.LEAD_INTAKE_CATERER_ID?.trim();

    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = 20;
    const offset = (page - 1) * pageSize;
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
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: pageSize,
        include: eventListInclude
      })
    ]);
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
        eventType: ev.title,
        eventDate: ev.eventDate.toISOString(),
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
          "Public form submissions are saved under a different caterer account than the one linked to your login. " +
          "Sign in with the email that owns your lead intake account, or set LEAD_INTAKE_CATERER_ID to your caterer id in apps/api/.env.";
      }
    }

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
