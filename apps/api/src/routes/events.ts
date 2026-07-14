import { prisma } from "@tripeseats/database";
import type { Prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import {
  eventTypeTitle,
  formatEventServiceLabel,
  formatOrderMode,
  formatServiceType,
  isCustomerType,
  isEventType,
  isOrderMode,
  isServiceType,
  legacyEventToServiceFields,
  syncLegacyEventType,
  type CustomerTypeValue,
  type EventTypeValue,
  type OrderModeValue,
  type ServiceTypeValue
} from "../lib/event-customer-types";
import {
  expandPackageSlotLabels,
  loadMenuPreferencesForEvent,
  parseMenuPreferencesPatch,
  saveMenuPreferences,
  syncMenuPreferencesForPackage
} from "../lib/menu-preferences";
import { getAuthorizedSession } from "../lib/authorized-session";
import { handleRouteError } from "../lib/route-errors";
import { timer } from "../lib/perf";

const router = Router();

function paramId(req: Request): string {
  const raw = req.params["id"];
  return Array.isArray(raw) ? raw[0]! : String(raw);
}

const EVENT_STATUSES = ["lead", "discussion", "booked", "completed", "lost"] as const;
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

router.get("/stats", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "events:read");
    const catererId = caterer.id;

    const [total, lead, discussion, booked, completed, lost] = await Promise.all([
      prisma.event.count({ where: { catererId } }),
      prisma.event.count({ where: { catererId, status: "lead" } }),
      prisma.event.count({ where: { catererId, status: "discussion" } }),
      prisma.event.count({ where: { catererId, status: "booked" } }),
      prisma.event.count({ where: { catererId, status: "completed" } }),
      prisma.event.count({ where: { catererId, status: "lost" } })
    ]);

    return res.json({ total, lead, discussion, booked, completed, lost });
  } catch (e) {
    return handleRouteError(res, e, "Events");
  }
});

router.get("/client-history", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "events:read");
    const emailRaw = typeof req.query.email === "string" ? req.query.email.trim() : "";
    const phoneRaw = typeof req.query.phone === "string" ? req.query.phone.trim() : "";
    const excludeEventId =
      typeof req.query.excludeEventId === "string" ? req.query.excludeEventId.trim() : "";

    if (!emailRaw && !phoneRaw) {
      return res.status(400).json({ error: "email or phone is required." });
    }

    const guestFilters: Prisma.GuestWhereInput[] = [];
    if (emailRaw) {
      guestFilters.push({ email: { equals: emailRaw, mode: "insensitive" } });
    }
    if (phoneRaw) {
      const digits = phoneRaw.replace(/\D/g, "");
      if (digits.length >= 7) {
        guestFilters.push({ phone: { contains: digits.slice(-10) } });
      }
    }
    if (guestFilters.length === 0) {
      return res.json({ items: [] });
    }

    const events = await prisma.event.findMany({
      where: {
        catererId: caterer.id,
        ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
        primaryGuest: { OR: guestFilters }
      },
      orderBy: { eventDate: "desc" },
      take: 25,
      select: {
        id: true,
        title: true,
        status: true,
        eventDate: true,
        guestCountEstimate: true,
        venueName: true,
        venueAddress: true,
        primaryGuest: {
          select: { firstName: true, lastName: true, email: true, phone: true }
        },
        quotes: {
          where: { status: { not: "archived" } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, totalAmount: true, status: true, updatedAt: true }
        }
      }
    });

    return res.json({
      items: events.map((ev) => ({
        id: ev.id,
        title: ev.title,
        status: ev.status,
        eventDate: ev.eventDate.toISOString(),
        guestCountEstimate: ev.guestCountEstimate,
        location: [ev.venueName, ev.venueAddress].filter(Boolean).join(" · ") || null,
        guest: ev.primaryGuest
          ? {
              name: [ev.primaryGuest.firstName, ev.primaryGuest.lastName]
                .filter(Boolean)
                .join(" "),
              email: ev.primaryGuest.email,
              phone: ev.primaryGuest.phone
            }
          : null,
        latestQuote: ev.quotes[0]
          ? {
              id: ev.quotes[0].id,
              totalAmount: ev.quotes[0].totalAmount,
              status: ev.quotes[0].status,
              updatedAt: ev.quotes[0].updatedAt.toISOString()
            }
          : null
      }))
    });
  } catch (e) {
    return handleRouteError(res, e, "Events");
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

  const serviceType = (ev.serviceType ?? legacyEventToServiceFields(ev.eventType).serviceType) as ServiceTypeValue;
  const orderMode = (ev.orderMode ?? legacyEventToServiceFields(ev.eventType).orderMode) as OrderModeValue;

  return {
    id: ev.id,
    catererId: ev.catererId,
    leadId: ev.leadId,
    title: ev.title,
    eventType: ev.eventType,
    eventTypeLabel: formatEventServiceLabel(serviceType, orderMode),
    serviceType,
    orderMode,
    serviceTypeLabel: formatServiceType(serviceType),
    orderModeLabel: formatOrderMode(orderMode),
    customerType: ev.customerType,
    status: ev.status,
    eventDate: ev.eventDate.toISOString(),
    eventTime: ev.eventTime,
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

router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "events:write");
    const id = paramId(req);
    const body = req.body as {
      eventType?: string;
      serviceType?: string;
      orderMode?: string;
      customerType?: string;
    };

    const existing = await loadEventForCaterer(id, caterer.id);
    if (!existing) {
      return res.status(404).json({ error: "Event not found." });
    }

    const data: {
      eventType?: EventTypeValue;
      serviceType?: ServiceTypeValue;
      orderMode?: OrderModeValue;
      customerType?: CustomerTypeValue;
      title?: string;
    } = {};

    let nextServiceType =
      (existing.serviceType as ServiceTypeValue | null) ??
      legacyEventToServiceFields(existing.eventType).serviceType;
    let nextOrderMode =
      (existing.orderMode as OrderModeValue | null) ??
      legacyEventToServiceFields(existing.eventType).orderMode;

    if (body.serviceType !== undefined) {
      const next = body.serviceType.trim().toLowerCase();
      if (!isServiceType(next)) {
        return res.status(400).json({ error: "Invalid service type." });
      }
      nextServiceType = next;
      data.serviceType = next;
    }

    if (body.orderMode !== undefined) {
      const next = body.orderMode.trim().toLowerCase();
      if (!isOrderMode(next)) {
        return res.status(400).json({ error: "Invalid order mode." });
      }
      nextOrderMode = next;
      data.orderMode = next;
    }

    if (body.eventType !== undefined && body.serviceType === undefined && body.orderMode === undefined) {
      const next = body.eventType.trim().toLowerCase();
      if (!isEventType(next)) {
        return res.status(400).json({ error: "Invalid event type." });
      }
      const mapped = legacyEventToServiceFields(next);
      nextServiceType = mapped.serviceType;
      nextOrderMode = mapped.orderMode;
      data.serviceType = mapped.serviceType;
      data.orderMode = mapped.orderMode;
    }

    if (data.serviceType !== undefined || data.orderMode !== undefined) {
      data.eventType = syncLegacyEventType(nextServiceType, nextOrderMode);
      data.title = formatEventServiceLabel(nextServiceType, nextOrderMode);
    }

    if (body.customerType !== undefined) {
      const next = body.customerType.trim().toLowerCase();
      if (!isCustomerType(next)) {
        return res.status(400).json({ error: "Invalid customer type." });
      }
      data.customerType = next;
    }

    if (!Object.keys(data).length) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    const updated = await prisma.event.update({
      where: { id },
      data,
      include: {
        primaryGuest: true,
        lead: true,
        tasks: { orderBy: { createdAt: "asc" } }
      }
    });

    if (data.customerType && existing.leadId) {
      await prisma.lead.update({
        where: { id: existing.leadId },
        data: { customerType: data.customerType }
      });
    }

    return res.json({ event: serializeEvent(updated as LoadedEvent) });
  } catch (e) {
    return handleRouteError(res, e, "Events");
  }
});

router.patch("/:id/time", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "events:write");
    const id = paramId(req);
    const raw = (req.body as { eventTime?: unknown }).eventTime;

    if (raw !== null && raw !== undefined && typeof raw !== "string") {
      return res.status(400).json({ error: "eventTime must be a string or null." });
    }

    const eventTime =
      typeof raw === "string" ? (raw.trim() ? raw.trim() : null) : null;

    const existing = await loadEventForCaterer(id, caterer.id);
    if (!existing) {
      return res.status(404).json({ error: "Event not found." });
    }

    const updated = await prisma.event.update({
      where: { id },
      data: { eventTime },
      include: {
        primaryGuest: true,
        lead: true,
        tasks: { orderBy: { createdAt: "asc" } }
      }
    });

    return res.json({ eventTime: updated.eventTime, event: serializeEvent(updated as LoadedEvent) });
  } catch (e) {
    return handleRouteError(res, e, "Events");
  }
});

router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "events:write");
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
    return handleRouteError(res, e, "Events");
  }
});

router.patch("/:id/notes", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "events:write");
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
    return handleRouteError(res, e, "Events");
  }
});

router.patch("/:id/guest", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "events:write");
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
    return handleRouteError(res, e, "Events");
  }
});

router.patch("/:id/customer-type", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "events:write");
    const id = paramId(req);
    const customerType = (req.body as { customerType?: string })?.customerType;

    if (!customerType || !isCustomerType(customerType)) {
      return res.status(400).json({ error: "Invalid type" });
    }

    const event = await prisma.event.findFirst({
      where: { id, catererId: caterer.id },
      select: { id: true, catererId: true, leadId: true }
    });

    if (!event) {
      return res.status(404).json({ error: "Not found" });
    }

    const updated = await prisma.event.update({
      where: { id },
      data: { customerType },
      include: {
        primaryGuest: true,
        lead: true,
        tasks: { orderBy: { createdAt: "asc" } }
      }
    });

    if (event.leadId) {
      await prisma.lead.update({
        where: { id: event.leadId },
        data: { customerType }
      });
    }

    return res.json({ customerType: updated.customerType, event: serializeEvent(updated as LoadedEvent) });
  } catch (e) {
    return handleRouteError(res, e, "Events");
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = paramId(req);
    const perf = timer(`event:${id}`);

    const { caterer } = await getAuthorizedSession(req, "events:read");
    perf.step("session + caterer");

    const ev = await loadEventForCaterer(id, caterer.id);
    perf.step("db:event+guest+tasks");

    if (!ev) {
      perf.end();
      return res.status(404).json({ error: "Event not found." });
    }

    parseNotes(ev.notes);
    perf.step("notes:parse");

    perf.end();
    return res.json({ event: serializeEvent(ev) });
  } catch (e) {
    return handleRouteError(res, e, "Events");
  }
});

async function loadEventPackageContext(eventId: string, catererId: string) {
  const quote = await prisma.quote.findFirst({
    where: { eventId, catererId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      lineItems: {
        where: { unitType: "tiered_per_head" },
        select: {
          packageId: true,
          package: {
            select: {
              id: true,
              name: true,
              items: { orderBy: { sortOrder: "asc" } }
            }
          }
        },
        take: 1
      }
    }
  });

  const packageLine = quote?.lineItems[0];
  if (!packageLine?.packageId || !packageLine.package) return null;

  return {
    quoteId: quote!.id,
    packageId: packageLine.packageId,
    packageName: packageLine.package.name,
    packageItems: packageLine.package.items
  };
}

router.get("/:id/menu-preferences", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "events:read");
    const id = paramId(req);

    const event = await prisma.event.findFirst({
      where: { id, catererId: caterer.id },
      select: { id: true }
    });
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }

    const pkgCtx = await loadEventPackageContext(id, caterer.id);
    if (!pkgCtx) {
      return res.json({ hasPackage: false });
    }

    let preferences = await loadMenuPreferencesForEvent(id);
    if (preferences.length === 0) {
      await syncMenuPreferencesForPackage(
        id,
        pkgCtx.packageId,
        caterer.id,
        pkgCtx.packageItems.map((item) => ({ label: item.label, quantity: item.quantity }))
      );
      preferences = await loadMenuPreferencesForEvent(id);
    }
    const slotLabels = expandPackageSlotLabels(
      pkgCtx.packageItems.map((item) => ({ label: item.label, quantity: item.quantity }))
    );

    const menuItems = await prisma.menuItem.findMany({
      where: { catererId: caterer.id },
      orderBy: [{ usageCount: "desc" }, { name: "asc" }],
      select: {
        id: true,
        category: true,
        name: true,
        defaultPrice: true,
        defaultUnit: true,
        usageCount: true,
        isDefault: true
      }
    });

    const menuItemsByCategory: Record<string, typeof menuItems> = {};
    for (const item of menuItems) {
      const key = item.category;
      if (!menuItemsByCategory[key]) menuItemsByCategory[key] = [];
      menuItemsByCategory[key]!.push(item);
    }

    return res.json({
      hasPackage: true,
      quoteId: pkgCtx.quoteId,
      packageId: pkgCtx.packageId,
      packageName: pkgCtx.packageName,
      slotLabels,
      packageItems: pkgCtx.packageItems,
      preferences: preferences.map((p) => ({
        slotLabel: p.slotLabel,
        selectedItem: p.selectedItem
      })),
      totalSlots: slotLabels.length,
      configuredCount: preferences.filter((p) => p.selectedItem.trim()).length,
      menuItemsByCategory
    });
  } catch (e) {
    return handleRouteError(res, e, "Events");
  }
});

router.patch("/:id/menu-preferences", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "events:write");
    const id = paramId(req);

    const event = await prisma.event.findFirst({
      where: { id, catererId: caterer.id },
      select: { id: true }
    });
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }

    const pkgCtx = await loadEventPackageContext(id, caterer.id);
    if (!pkgCtx) {
      return res.status(400).json({ error: "No package on this event's quote." });
    }

    const parsed = parseMenuPreferencesPatch(req.body);
    if (!parsed) {
      return res.status(400).json({ error: "Invalid preferences payload." });
    }

    const allowedSlots = new Set(
      expandPackageSlotLabels(
        pkgCtx.packageItems.map((item) => ({ label: item.label, quantity: item.quantity }))
      )
    );

    for (const pref of parsed) {
      if (!allowedSlots.has(pref.slotLabel)) {
        return res.status(400).json({ error: `Invalid slot: ${pref.slotLabel}` });
      }
    }

    const saved = await saveMenuPreferences(id, pkgCtx.packageId, parsed);

    return res.json({
      preferences: saved.map((p) => ({
        slotLabel: p.slotLabel,
        selectedItem: p.selectedItem
      }))
    });
  } catch (e) {
    return handleRouteError(res, e, "Events");
  }
});

export const eventsRouter = router;
