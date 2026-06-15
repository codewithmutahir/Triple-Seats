import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { getSession, SessionError } from "../lib/session";

const router = Router();

function paramId(req: Request): string {
  const raw = req.params["id"];
  return Array.isArray(raw) ? raw[0]! : String(raw);
}

const EVENT_STATUSES = ["lead", "discussion", "booked", "completed"] as const;
type AllowedEventStatus = (typeof EVENT_STATUSES)[number];

const ACTIVITY_MARKER = "\n\n__TRIPE_ACTIVITY_JSON__\n";

export type ActivityEntry = {
  at: string;
  type: "created" | "status";
  label: string;
};

function parseNotes(raw: string | null): { body: string; activity: ActivityEntry[] } {
  const rawStr = raw ?? "";
  const i = rawStr.indexOf(ACTIVITY_MARKER);
  if (i === -1) {
    return { body: rawStr, activity: [] };
  }
  const body = rawStr.slice(0, i);
  try {
    const parsed = JSON.parse(rawStr.slice(i + ACTIVITY_MARKER.length));
    return { body, activity: Array.isArray(parsed) ? (parsed as ActivityEntry[]) : [] };
  } catch {
    return { body, activity: [] };
  }
}

function serializeNotes(body: string, activity: ActivityEntry[]): string {
  const trimmed = body.replace(/\s+$/u, "");
  if (!activity.length) {
    return trimmed;
  }
  return `${trimmed}${ACTIVITY_MARKER}${JSON.stringify(activity)}`;
}

function extractPreferredSlots(body: string): string[] {
  const m = body.match(/Preferred time slots:\s*([^\n]+)/i);
  if (!m?.[1]) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractEventLocation(body: string): string | null {
  const m = body.match(/Event location:\s*([^\n]+)/i);
  return m?.[1]?.trim() || null;
}

function extractAdditionalNotes(body: string): string {
  const m = body.match(/(?:^|\n)Additional notes:\s*([\s\S]*)$/im);
  if (m?.[1] != null) return m[1].trim();
  return "";
}

function mergeAdditionalNotesIntoBody(body: string, additional: string): string {
  const without = body.replace(/(?:^|\n)Additional notes:\s*[\s\S]*$/im, "").trimEnd();
  const trimmedAdd = additional.trim();
  if (!trimmedAdd) {
    return without;
  }
  return `${without}\nAdditional notes: ${trimmedAdd}`;
}

function isAllowedEventStatus(s: string): s is AllowedEventStatus {
  return (EVENT_STATUSES as readonly string[]).includes(s);
}

function handleSessionError(res: Response, e: unknown) {
  if (e instanceof SessionError) {
    return res.status(e.status).json({ error: e.message });
  }
  console.error("Events route error:", e);
  return res.status(500).json({ error: "Internal server error" });
}

router.get("/stats", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const catererId = caterer.id;

    const [total, lead, discussion, booked, completed] = await Promise.all([
      prisma.event.count({ where: { catererId } }),
      prisma.event.count({ where: { catererId, status: "lead" } }),
      prisma.event.count({ where: { catererId, status: "discussion" } }),
      prisma.event.count({ where: { catererId, status: "booked" } }),
      prisma.event.count({ where: { catererId, status: "completed" } })
    ]);

    return res.json({ total, lead, discussion, booked, completed });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

async function loadEventForCaterer(eventId: string, catererId: string) {
  return prisma.event.findFirst({
    where: { id: eventId, catererId },
    include: {
      primaryGuest: true,
      lead: true,
      tasks: { orderBy: { createdAt: "asc" } }
    }
  });
}

type LoadedEvent = NonNullable<Awaited<ReturnType<typeof loadEventForCaterer>>>;

function serializeEvent(ev: LoadedEvent) {
  const { body, activity } = parseNotes(ev.notes);
  const hasCreated = activity.some((a) => a.type === "created");
  const mergedActivity: ActivityEntry[] = hasCreated
    ? activity
    : [{ at: ev.createdAt.toISOString(), type: "created", label: "Event created" }, ...activity];

  return {
    id: ev.id,
    catererId: ev.catererId,
    leadId: ev.leadId,
    title: ev.title,
    status: ev.status,
    eventDate: ev.eventDate.toISOString(),
    startTime: ev.startTime?.toISOString() ?? null,
    endTime: ev.endTime?.toISOString() ?? null,
    venueName: ev.venueName,
    venueAddress: ev.venueAddress,
    guestCountEstimate: ev.guestCountEstimate,
    notes: ev.notes,
    notesBody: body,
    preferredSlots: extractPreferredSlots(body),
    eventLocationFromNotes: extractEventLocation(body),
    additionalNotes: extractAdditionalNotes(body),
    activity: mergedActivity,
    createdAt: ev.createdAt.toISOString(),
    updatedAt: ev.updatedAt.toISOString(),
    primaryGuest: ev.primaryGuest
      ? {
          id: ev.primaryGuest.id,
          firstName: ev.primaryGuest.firstName,
          lastName: ev.primaryGuest.lastName,
          email: ev.primaryGuest.email,
          phone: ev.primaryGuest.phone
        }
      : null,
    lead: ev.lead
      ? {
          id: ev.lead.id,
          title: ev.lead.title,
          notes: ev.lead.notes,
          estimatedGuests: ev.lead.estimatedGuests,
          expectedEventAt: ev.lead.expectedEventAt?.toISOString() ?? null
        }
      : null,
    tasks: ev.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueAt: t.dueAt?.toISOString() ?? null,
      completedAt: t.completedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString()
    }))
  };
}

router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const id = paramId(req);
    const status = (req.body as { status?: string })?.status;
    if (!status || !isAllowedEventStatus(status)) {
      return res.status(400).json({ error: "Invalid status." });
    }

    const existing = await loadEventForCaterer(id, caterer.id);
    if (!existing) {
      return res.status(404).json({ error: "Event not found." });
    }

    const prevStatus = existing.status;
    const { body, activity } = parseNotes(existing.notes);
    const deduped: ActivityEntry[] =
      prevStatus === status
        ? activity
        : [
            ...activity,
            {
              at: new Date().toISOString(),
              type: "status",
              label: `Status changed to ${status}`
            }
          ];

    const updated = await prisma.event.update({
      where: { id },
      data: {
        status,
        notes: serializeNotes(body, deduped)
      },
      include: {
        primaryGuest: true,
        lead: true,
        tasks: { orderBy: { createdAt: "asc" } }
      }
    });

    return res.json({ event: serializeEvent(updated as LoadedEvent) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.patch("/:id/notes", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const id = paramId(req);
    const notes = (req.body as { notes?: string })?.notes;
    if (typeof notes !== "string") {
      return res.status(400).json({ error: "notes must be a string." });
    }

    const existing = await loadEventForCaterer(id, caterer.id);
    if (!existing) {
      return res.status(404).json({ error: "Event not found." });
    }

    const { body, activity } = parseNotes(existing.notes);
    const newBody = mergeAdditionalNotesIntoBody(body, notes);

    const updated = await prisma.event.update({
      where: { id },
      data: { notes: serializeNotes(newBody, activity) },
      include: {
        primaryGuest: true,
        lead: true,
        tasks: { orderBy: { createdAt: "asc" } }
      }
    });

    return res.json({ event: serializeEvent(updated as LoadedEvent) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.patch("/:id/guest", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const id = paramId(req);
    const body = req.body as {
      firstName?: string;
      lastName?: string | null;
      email?: string | null;
      phone?: string | null;
      guestCountEstimate?: number;
    };

    const existing = await loadEventForCaterer(id, caterer.id);
    if (!existing) {
      return res.status(404).json({ error: "Event not found." });
    }
    if (!existing.primaryGuestId || !existing.primaryGuest) {
      return res.status(400).json({ error: "No primary guest on this event." });
    }

    const guestId = existing.primaryGuestId;
    const guestUpdate: {
      firstName?: string;
      lastName?: string | null;
      email?: string | null;
      phone?: string | null;
    } = {};
    if (typeof body.firstName === "string") guestUpdate.firstName = body.firstName.trim();
    if (body.lastName !== undefined) guestUpdate.lastName = body.lastName?.trim() || null;
    if (body.email !== undefined) guestUpdate.email = body.email?.trim() || null;
    if (body.phone !== undefined) guestUpdate.phone = body.phone?.trim() || null;

    const eventUpdate: { guestCountEstimate?: number } = {};
    if (typeof body.guestCountEstimate === "number" && Number.isFinite(body.guestCountEstimate)) {
      eventUpdate.guestCountEstimate = Math.max(0, Math.floor(body.guestCountEstimate));
    }

    if (Object.keys(guestUpdate).length > 0) {
      await prisma.guest.update({
        where: { id: guestId },
        data: guestUpdate
      });
    }
    if (Object.keys(eventUpdate).length > 0) {
      await prisma.event.update({
        where: { id },
        data: eventUpdate
      });
    }

    const updated = await loadEventForCaterer(id, caterer.id);
    if (!updated) {
      return res.status(404).json({ error: "Event not found." });
    }

    return res.json({ event: serializeEvent(updated) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getSession(req);
    const id = paramId(req);
    const ev = await loadEventForCaterer(id, caterer.id);
    if (!ev) {
      return res.status(404).json({ error: "Event not found." });
    }
    return res.json({ event: serializeEvent(ev) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

export const eventsRouter = router;
