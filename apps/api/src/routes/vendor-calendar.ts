import {
  prisma,
  type CalendarShareScope,
  type CalendarShowAs,
  type Prisma
} from "@tripeseats/database";
import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { getExternalVendorCaterer } from "../lib/external-vendor-caterer";
import {
  emailHasExistingFullDashboardAccess,
  revokeCalendarOnlyAccessIfOrphaned
} from "../lib/calendar-only-session";
import { getAuthorizedSession } from "../lib/authorized-session";
import {
  expirePendingInviteIfNeeded,
  freshInviteSentAt,
  inviteExpiresAt
} from "../lib/invite-ttl";
import { handleRouteError } from "../lib/route-errors";
import { getSession } from "../lib/session";
import { timer } from "../lib/perf";
import {
  expandVendorCalendarOccurrences,
  recurringMasterWhere
} from "../lib/vendor-calendar-recurrence";
import { buildIcalCalendar, entryColorHex, generateIcalToken } from "../lib/vendor-calendar-ical";
import {
  dispatchDueVendorCalendarReminders,
  sendVendorCalendarAttendeeInviteEmail,
  sendVendorCalendarExternalInviteEmail
} from "../lib/vendor-calendar-mail";
import { queueGoogleDelete, queueGooglePush } from "../lib/google-calendar-sync";
import { vendorCalendarGoogleRouter } from "./vendor-calendar-google";

const router = Router();

function webOrigin(): string {
  return process.env.WEB_ORIGIN?.trim() || process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3000";
}

const externalInviteBodySchema = z.object({
  email: z.string().email(),
  name: z.string().trim().max(120).optional()
});

const MAX_RANGE_MS = 93 * 24 * 60 * 60 * 1000;

const SHOW_AS = ["busy", "free", "tentative", "oof"] as const;
const SHARE_SCOPES = ["view", "edit"] as const;
const RECURRENCE_FREQ = ["none", "daily", "weekly", "monthly", "yearly"] as const;

const isoDateString = z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
  message: "Invalid ISO datetime"
});
const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color")
  .nullable()
  .optional();
const meetingUrl = z.union([z.string().trim().url().max(2000), z.literal(""), z.null()]).optional();
const attendeeSchema = z.object({
  email: z.string().trim().email().max(320),
  name: z.string().trim().max(120).nullable().optional()
});

const entryBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(10_000).nullable().optional(),
  location: z.string().trim().max(500).nullable().optional(),
  startAt: isoDateString,
  endAt: isoDateString,
  allDay: z.boolean().optional(),
  showAs: z.enum(SHOW_AS).optional(),
  isPrivate: z.boolean().optional(),
  recurrenceFreq: z.enum(RECURRENCE_FREQ).optional(),
  recurrenceInterval: z.number().int().min(1).max(365).optional(),
  recurrenceDaysOfWeek: z.string().trim().max(32).nullable().optional(),
  recurrenceEndAt: isoDateString.nullable().optional(),
  recurrenceCount: z.number().int().min(1).max(500).nullable().optional(),
  reminderMinutesBefore: z.number().int().min(1).max(10080).nullable().optional(),
  meetingUrl,
  colorHex: hexColor,
  attendees: z.array(attendeeSchema).max(20).optional()
});

const entryPatchSchema = entryBodySchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field required" }
);

const duplicateBodySchema = z.object({
  startAt: isoDateString.optional(),
  endAt: isoDateString.optional()
});

const entrySelect = {
  id: true,
  catererId: true,
  ownerUserId: true,
  title: true,
  notes: true,
  location: true,
  startAt: true,
  endAt: true,
  allDay: true,
  showAs: true,
  isPrivate: true,
  recurrenceFreq: true,
  recurrenceInterval: true,
  recurrenceDaysOfWeek: true,
  recurrenceEndAt: true,
  recurrenceCount: true,
  reminderMinutesBefore: true,
  meetingUrl: true,
  colorHex: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, name: true, email: true } },
  attendees: { select: { id: true, email: true, name: true } }
} as const;

type EntryRow = {
  id: string;
  catererId: string;
  ownerUserId: string;
  title: string;
  notes: string | null;
  location: string | null;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  showAs: CalendarShowAs;
  isPrivate: boolean;
  recurrenceFreq: (typeof RECURRENCE_FREQ)[number];
  recurrenceInterval: number;
  recurrenceDaysOfWeek: string | null;
  recurrenceEndAt: Date | null;
  recurrenceCount: number | null;
  reminderMinutesBefore: number | null;
  meetingUrl: string | null;
  colorHex: string | null;
  createdAt: Date;
  updatedAt: Date;
  owner?: { id: string; name: string | null; email: string } | null;
  attendees?: Array<{ id: string; email: string; name: string | null }>;
};

function paramId(req: Request): string {
  const raw = req.params["id"];
  return Array.isArray(raw) ? raw[0]! : String(raw);
}

function requireSuperAdmin(isSuperAdmin: boolean) {
  if (!isSuperAdmin) {
    throw Object.assign(new Error("Super admin only"), { status: 403 });
  }
}

type AccessScope = CalendarShareScope | "owner" | "super_admin";

async function resolveCalendarAccess(
  viewerUserId: string,
  targetUserId: string,
  isSuperAdmin: boolean
): Promise<AccessScope | null> {
  if (viewerUserId === targetUserId) return "owner";
  if (isSuperAdmin) return "super_admin";
  const grant = await prisma.calendarShareGrant.findUnique({
    where: {
      granteeUserId_targetUserId: {
        granteeUserId: viewerUserId,
        targetUserId
      }
    },
    select: { scope: true }
  });
  return grant?.scope ?? null;
}

function canEdit(access: AccessScope | null): boolean {
  return access === "owner" || access === "super_admin" || access === "edit";
}

function serializeEntry(
  row: EntryRow,
  opts: { hidePrivateNotes: boolean },
  occurrence?: { occurrenceId: string; startAt: Date; endAt: Date; isRecurrenceInstance: boolean }
) {
  const hideNotes = opts.hidePrivateNotes && row.isPrivate;
  return {
    id: row.id,
    occurrenceId: occurrence?.occurrenceId ?? row.id,
    seriesId: row.id,
    isRecurrenceInstance: occurrence?.isRecurrenceInstance ?? false,
    catererId: row.catererId,
    ownerUserId: row.ownerUserId,
    title: row.title,
    notes: hideNotes ? null : row.notes,
    location: row.location,
    startAt: (occurrence?.startAt ?? row.startAt).toISOString(),
    endAt: (occurrence?.endAt ?? row.endAt).toISOString(),
    allDay: row.allDay,
    showAs: row.showAs,
    isPrivate: row.isPrivate,
    recurrenceFreq: row.recurrenceFreq,
    recurrenceInterval: row.recurrenceInterval,
    recurrenceDaysOfWeek: row.recurrenceDaysOfWeek,
    recurrenceEndAt: row.recurrenceEndAt?.toISOString() ?? null,
    recurrenceCount: row.recurrenceCount,
    reminderMinutesBefore: row.reminderMinutesBefore,
    meetingUrl: row.meetingUrl,
    colorHex: row.colorHex,
    color: entryColorHex(row.showAs, row.colorHex),
    attendees: (row.attendees ?? []).map((a) => ({
      id: a.id,
      email: a.email,
      name: a.name
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    owner: row.owner
      ? {
          id: row.owner.id,
          name: row.owner.name,
          email: row.owner.email
        }
      : undefined
  };
}

function recurrenceDataFromBody(data: z.infer<typeof entryBodySchema>) {
  return {
    recurrenceFreq: (data.recurrenceFreq ?? "none") as (typeof RECURRENCE_FREQ)[number],
    recurrenceInterval: data.recurrenceInterval ?? 1,
    recurrenceDaysOfWeek: data.recurrenceDaysOfWeek ?? null,
    recurrenceEndAt: data.recurrenceEndAt ? new Date(data.recurrenceEndAt) : null,
    recurrenceCount: data.recurrenceCount ?? null,
    reminderMinutesBefore: data.reminderMinutesBefore ?? null,
    meetingUrl: data.meetingUrl && data.meetingUrl.trim() ? data.meetingUrl.trim() : null,
    colorHex: data.colorHex ?? null
  };
}

type AttendeeInput = z.infer<typeof attendeeSchema>;

function queueAttendeeInvites(
  entry: {
    title: string;
    startAt: Date;
    endAt: Date;
    allDay: boolean;
    location: string | null;
    meetingUrl: string | null;
    notes: string | null;
    isPrivate: boolean;
  },
  owner: { name: string | null; email: string },
  attendees: AttendeeInput[]
) {
  for (const attendee of attendees) {
    void sendVendorCalendarAttendeeInviteEmail({
      to: attendee.email,
      attendeeName: attendee.name,
      ownerName: owner.name,
      ownerEmail: owner.email,
      title: entry.title,
      startAt: entry.startAt,
      endAt: entry.endAt,
      allDay: entry.allDay,
      location: entry.location,
      meetingUrl: entry.meetingUrl,
      notes: entry.isPrivate ? null : entry.notes
    }).catch(() => undefined);
  }
}

async function replaceAttendees(
  entryId: string,
  catererId: string,
  attendees: AttendeeInput[] | undefined,
  opts: {
    entry: Parameters<typeof queueAttendeeInvites>[0];
    owner: { name: string | null; email: string };
  }
) {
  if (attendees === undefined) return;

  const existing = await prisma.vendorCalendarAttendee.findMany({
    where: { entryId },
    select: { email: true }
  });
  const existingEmails = new Set(existing.map((a) => a.email.toLowerCase()));

  await prisma.vendorCalendarAttendee.deleteMany({ where: { entryId, catererId } });
  if (attendees.length > 0) {
    await prisma.vendorCalendarAttendee.createMany({
      data: attendees.map((a) => ({
        catererId,
        entryId,
        email: a.email.toLowerCase(),
        name: a.name ?? null
      }))
    });
  }

  const newlyAdded = attendees.filter((a) => !existingEmails.has(a.email.toLowerCase()));
  if (newlyAdded.length > 0) {
    queueAttendeeInvites(opts.entry, opts.owner, newlyAdded);
  }
}

async function collectIcalEventsForOwner(ownerUserId: string, rangeStart: Date, rangeEnd: Date) {
  const [singleRows, recurringRows] = await Promise.all([
    prisma.vendorCalendarEntry.findMany({
      where: {
        ownerUserId,
        recurrenceFreq: "none",
        ...rangeWhere(rangeStart, rangeEnd)
      },
      select: {
        id: true,
        title: true,
        notes: true,
        location: true,
        meetingUrl: true,
        startAt: true,
        endAt: true,
        allDay: true,
        isPrivate: true,
        recurrenceFreq: true,
        recurrenceInterval: true,
        recurrenceDaysOfWeek: true,
        recurrenceEndAt: true,
        recurrenceCount: true
      }
    }),
    prisma.vendorCalendarEntry.findMany({
      where: {
        ownerUserId,
        ...recurringMasterWhere(rangeStart, rangeEnd)
      },
      select: {
        id: true,
        title: true,
        notes: true,
        location: true,
        meetingUrl: true,
        startAt: true,
        endAt: true,
        allDay: true,
        isPrivate: true,
        recurrenceFreq: true,
        recurrenceInterval: true,
        recurrenceDaysOfWeek: true,
        recurrenceEndAt: true,
        recurrenceCount: true
      }
    })
  ]);

  const events: Parameters<typeof buildIcalCalendar>[0] = [];

  for (const row of singleRows) {
    events.push({
      uid: `${row.id}@tripeseats`,
      title: row.title,
      description: row.isPrivate ? null : row.notes,
      location: row.location,
      meetingUrl: row.meetingUrl,
      startAt: row.startAt,
      endAt: row.endAt,
      allDay: row.allDay
    });
  }

  for (const row of recurringRows) {
    const occurrences = expandVendorCalendarOccurrences(row, rangeStart, rangeEnd);
    for (const occ of occurrences) {
      events.push({
        uid: `${occ.occurrenceId}@tripeseats`,
        title: row.title,
        description: row.isPrivate ? null : row.notes,
        location: row.location,
        meetingUrl: row.meetingUrl,
        startAt: occ.startAt,
        endAt: occ.endAt,
        allDay: row.allDay
      });
    }
  }

  return events;
}

const grantBodySchema = z.object({
  granteeUserId: z.string().min(1),
  targetUserId: z.string().min(1),
  scope: z.enum(SHARE_SCOPES).optional()
});

function parseRange(req: Request): { start: Date; end: Date } | { error: string } {
  const startRaw = typeof req.query.start === "string" ? req.query.start : "";
  const endRaw = typeof req.query.end === "string" ? req.query.end : "";
  if (!startRaw || !endRaw) {
    return { error: "start and end query params are required (ISO dates)" };
  }
  const start = new Date(startRaw);
  const end = new Date(endRaw);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: "Invalid start or end date" };
  }
  if (end.getTime() <= start.getTime()) {
    return { error: "end must be after start" };
  }
  if (end.getTime() - start.getTime() > MAX_RANGE_MS) {
    return { error: "Date range too large (max ~93 days)" };
  }
  return { start, end };
}

/** Overlap: entry.start < rangeEnd AND entry.end > rangeStart */
function rangeWhere(start: Date, end: Date): Prisma.VendorCalendarEntryWhereInput {
  return {
    startAt: { lt: end },
    endAt: { gt: start }
  };
}

function buildOwnerWhere(
  user: { id: string },
  caterer: { id: string },
  isSuperAdmin: boolean,
  ownerUserIdParam: string | null,
  catererIdParam: string | null
): Promise<Prisma.VendorCalendarEntryWhereInput | { error: string; status: number }> {
  return (async () => {
    if (catererIdParam) {
      if (!isSuperAdmin) {
        return { error: "Only super admin can filter by caterer", status: 403 };
      }
      const base: Prisma.VendorCalendarEntryWhereInput = { catererId: catererIdParam };
      if (ownerUserIdParam) {
        return { ...base, ownerUserId: ownerUserIdParam };
      }
      return base;
    }

    const targetUserId = ownerUserIdParam ?? user.id;
    const access = await resolveCalendarAccess(user.id, targetUserId, isSuperAdmin);
    if (!access) {
      return { error: "Not allowed to view this calendar", status: 403 };
    }
    const where: Prisma.VendorCalendarEntryWhereInput = { ownerUserId: targetUserId };
    if (targetUserId === user.id && !isSuperAdmin) {
      where.catererId = caterer.id;
    }
    return where;
  })();
}

async function loadEntryForUser(id: string) {
  return prisma.vendorCalendarEntry.findUnique({
    where: { id },
    select: entrySelect
  });
}

/** Authenticated: list entries for a visible calendar in a date range */
router.get("/entries", async (req: Request, res: Response) => {
  try {
    const perf = timer("vendor-calendar:entries");
    const { user, caterer, isSuperAdmin } = await getAuthorizedSession(req, "vendor_calendar:read");
    perf.step("session");

    const range = parseRange(req);
    if ("error" in range) {
      return res.status(400).json({ error: range.error });
    }

    const ownerUserIdParam =
      typeof req.query.ownerUserId === "string" && req.query.ownerUserId.trim()
        ? req.query.ownerUserId.trim()
        : null;
    const catererIdParam =
      typeof req.query.catererId === "string" && req.query.catererId.trim()
        ? req.query.catererId.trim()
        : null;

    let ownerWhere = await buildOwnerWhere(user, caterer, isSuperAdmin, ownerUserIdParam, catererIdParam);
    if ("error" in ownerWhere) {
      return res.status(ownerWhere.status).json({ error: ownerWhere.error });
    }

    const [singleRows, recurringRows] = await Promise.all([
      prisma.vendorCalendarEntry.findMany({
        where: {
          ...ownerWhere,
          recurrenceFreq: "none",
          ...rangeWhere(range.start, range.end)
        },
        orderBy: { startAt: "asc" },
        select: entrySelect
      }),
      prisma.vendorCalendarEntry.findMany({
        where: {
          ...ownerWhere,
          ...recurringMasterWhere(range.start, range.end)
        },
        orderBy: { startAt: "asc" },
        select: entrySelect
      })
    ]);
    perf.step("db:query");

    const items: ReturnType<typeof serializeEntry>[] = [];

    for (const row of singleRows) {
      const isOwnerOrSuper = row.ownerUserId === user.id || isSuperAdmin;
      items.push(serializeEntry(row, { hidePrivateNotes: !isOwnerOrSuper }));
    }

    for (const row of recurringRows) {
      const isOwnerOrSuper = row.ownerUserId === user.id || isSuperAdmin;
      const occurrences = expandVendorCalendarOccurrences(row, range.start, range.end);
      for (const occ of occurrences) {
        items.push(
          serializeEntry(
            row,
            { hidePrivateNotes: !isOwnerOrSuper },
            {
              occurrenceId: occ.occurrenceId,
              startAt: occ.startAt,
              endAt: occ.endAt,
              isRecurrenceInstance: occ.isRecurrenceInstance
            }
          )
        );
      }
    }

    items.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

    perf.end();
    return res.json({ items, start: range.start.toISOString(), end: range.end.toISOString() });
  } catch (e) {
    return handleRouteError(res, e, "Vendor calendar");
  }
});

/** Authenticated: create entry on own calendar */
router.post("/entries", async (req: Request, res: Response) => {
  try {
    const { user, caterer } = await getAuthorizedSession(req, "vendor_calendar:write");
    const parsed = entryBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const startAt = new Date(parsed.data.startAt);
    const endAt = new Date(parsed.data.endAt);
    if (endAt.getTime() <= startAt.getTime()) {
      return res.status(400).json({ error: "endAt must be after startAt" });
    }

    const row = await prisma.vendorCalendarEntry.create({
      data: {
        catererId: caterer.id,
        ownerUserId: user.id,
        title: parsed.data.title,
        notes: parsed.data.notes ?? null,
        location: parsed.data.location ?? null,
        startAt,
        endAt,
        allDay: parsed.data.allDay ?? false,
        showAs: (parsed.data.showAs ?? "busy") as CalendarShowAs,
        isPrivate: parsed.data.isPrivate ?? false,
        ...recurrenceDataFromBody(parsed.data),
        attendees: parsed.data.attendees?.length
          ? {
              create: parsed.data.attendees.map((a) => ({
                catererId: caterer.id,
                email: a.email.toLowerCase(),
                name: a.name ?? null
              }))
            }
          : undefined
      },
      select: entrySelect
    });

    if (parsed.data.attendees?.length && user.email) {
      queueAttendeeInvites(
        row,
        { name: user.name ?? null, email: user.email },
        parsed.data.attendees
      );
    }

    queueGooglePush(row.id);

    return res.status(201).json(serializeEntry(row, { hidePrivateNotes: false }));
  } catch (e) {
    return handleRouteError(res, e, "Vendor calendar create");
  }
});

/** Authenticated: update entry (owner, edit-grant, or super admin) */
router.patch("/entries/:id", async (req: Request, res: Response) => {
  try {
    const { user, isSuperAdmin } = await getAuthorizedSession(req, "vendor_calendar:write");
    const id = paramId(req);
    const parsed = entryPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const existing = await prisma.vendorCalendarEntry.findUnique({
      where: { id },
      select: {
        id: true,
        catererId: true,
        ownerUserId: true,
        title: true,
        notes: true,
        location: true,
        meetingUrl: true,
        isPrivate: true,
        allDay: true,
        startAt: true,
        endAt: true,
        owner: { select: { name: true, email: true } }
      }
    });
    if (!existing) {
      return res.status(404).json({ error: "Not found" });
    }

    const access = await resolveCalendarAccess(user.id, existing.ownerUserId, isSuperAdmin);
    if (!canEdit(access)) {
      return res.status(403).json({ error: "Not allowed to edit this entry" });
    }

    const startAt = parsed.data.startAt ? new Date(parsed.data.startAt) : existing.startAt;
    const endAt = parsed.data.endAt ? new Date(parsed.data.endAt) : existing.endAt;
    if (endAt.getTime() <= startAt.getTime()) {
      return res.status(400).json({ error: "endAt must be after startAt" });
    }

    const data: Prisma.VendorCalendarEntryUpdateInput = {};
    if (parsed.data.title !== undefined) data.title = parsed.data.title;
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;
    if (parsed.data.location !== undefined) data.location = parsed.data.location;
    if (parsed.data.startAt !== undefined) data.startAt = startAt;
    if (parsed.data.endAt !== undefined) data.endAt = endAt;
    if (parsed.data.allDay !== undefined) data.allDay = parsed.data.allDay;
    if (parsed.data.showAs !== undefined) data.showAs = parsed.data.showAs;
    if (parsed.data.isPrivate !== undefined) data.isPrivate = parsed.data.isPrivate;
    if (parsed.data.recurrenceFreq !== undefined) data.recurrenceFreq = parsed.data.recurrenceFreq;
    if (parsed.data.recurrenceInterval !== undefined) data.recurrenceInterval = parsed.data.recurrenceInterval;
    if (parsed.data.recurrenceDaysOfWeek !== undefined) {
      data.recurrenceDaysOfWeek = parsed.data.recurrenceDaysOfWeek;
    }
    if (parsed.data.recurrenceEndAt !== undefined) {
      data.recurrenceEndAt = parsed.data.recurrenceEndAt ? new Date(parsed.data.recurrenceEndAt) : null;
    }
    if (parsed.data.recurrenceCount !== undefined) data.recurrenceCount = parsed.data.recurrenceCount;
    if (parsed.data.reminderMinutesBefore !== undefined) {
      data.reminderMinutesBefore = parsed.data.reminderMinutesBefore;
    }
    if (parsed.data.meetingUrl !== undefined) {
      data.meetingUrl =
        parsed.data.meetingUrl && parsed.data.meetingUrl.trim()
          ? parsed.data.meetingUrl.trim()
          : null;
    }
    if (parsed.data.colorHex !== undefined) data.colorHex = parsed.data.colorHex;

    const row = await prisma.vendorCalendarEntry.update({
      where: { id },
      data,
      select: entrySelect
    });

    if (parsed.data.attendees !== undefined && existing.owner.email) {
      await replaceAttendees(id, existing.catererId, parsed.data.attendees, {
        entry: {
          title: row.title,
          startAt: row.startAt,
          endAt: row.endAt,
          allDay: row.allDay,
          location: row.location,
          meetingUrl: row.meetingUrl,
          notes: row.notes,
          isPrivate: row.isPrivate
        },
        owner: { name: existing.owner.name, email: existing.owner.email }
      });
    }

    const refreshed = parsed.data.attendees
      ? await loadEntryForUser(id)
      : row;

    queueGooglePush(id);

    return res.json(serializeEntry(refreshed ?? row, { hidePrivateNotes: false }));
  } catch (e) {
    return handleRouteError(res, e, "Vendor calendar update");
  }
});

/** Authenticated: delete entry */
router.delete("/entries/:id", async (req: Request, res: Response) => {
  try {
    const { user, isSuperAdmin } = await getAuthorizedSession(req, "vendor_calendar:write");
    const id = paramId(req);

    const existing = await prisma.vendorCalendarEntry.findUnique({
      where: { id },
      select: { id: true, ownerUserId: true, googleEventId: true }
    });
    if (!existing) {
      return res.status(404).json({ error: "Not found" });
    }

    const access = await resolveCalendarAccess(user.id, existing.ownerUserId, isSuperAdmin);
    if (!canEdit(access)) {
      return res.status(403).json({ error: "Not allowed to delete this entry" });
    }

    await prisma.vendorCalendarEntry.delete({ where: { id } });
    queueGoogleDelete(existing.ownerUserId, existing.googleEventId);
    return res.status(204).send();
  } catch (e) {
    return handleRouteError(res, e, "Vendor calendar delete");
  }
});

/** Duplicate an entry (optionally at new start/end); always creates on viewer's calendar if copy, else same owner */
router.post("/entries/:id/duplicate", async (req: Request, res: Response) => {
  try {
    const { user, caterer, isSuperAdmin } = await getAuthorizedSession(req, "vendor_calendar:write");
    const id = paramId(req);
    const parsed = duplicateBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const existing = await loadEntryForUser(id);
    if (!existing) {
      return res.status(404).json({ error: "Not found" });
    }

    const access = await resolveCalendarAccess(user.id, existing.ownerUserId, isSuperAdmin);
    if (!canEdit(access)) {
      return res.status(403).json({ error: "Not allowed to duplicate this entry" });
    }

    const durationMs = existing.endAt.getTime() - existing.startAt.getTime();
    const startAt = parsed.data.startAt ? new Date(parsed.data.startAt) : new Date(existing.startAt);
    const endAt = parsed.data.endAt
      ? new Date(parsed.data.endAt)
      : new Date(startAt.getTime() + durationMs);
    if (endAt.getTime() <= startAt.getTime()) {
      return res.status(400).json({ error: "endAt must be after startAt" });
    }

    const row = await prisma.vendorCalendarEntry.create({
      data: {
        catererId: existing.ownerUserId === user.id ? caterer.id : existing.catererId,
        ownerUserId: existing.ownerUserId,
        title: existing.title.startsWith("Copy of ") ? existing.title : `Copy of ${existing.title}`,
        notes: existing.notes,
        location: existing.location,
        startAt,
        endAt,
        allDay: existing.allDay,
        showAs: existing.showAs,
        isPrivate: existing.isPrivate,
        recurrenceFreq: "none",
        recurrenceInterval: 1,
        recurrenceDaysOfWeek: null,
        recurrenceEndAt: null,
        recurrenceCount: null,
        reminderMinutesBefore: existing.reminderMinutesBefore,
        meetingUrl: existing.meetingUrl,
        colorHex: existing.colorHex
      },
      select: entrySelect
    });

    return res.status(201).json(serializeEntry(row, { hidePrivateNotes: false }));
  } catch (e) {
    return handleRouteError(res, e, "Vendor calendar duplicate");
  }
});

/** Copy entry to the authenticated user's calendar (non-recurring snapshot) */
router.post("/entries/:id/copy-to-my-calendar", async (req: Request, res: Response) => {
  try {
    const { user, caterer, isSuperAdmin } = await getAuthorizedSession(req, "vendor_calendar:write");
    const id = paramId(req);
    const parsed = duplicateBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const existing = await loadEntryForUser(id);
    if (!existing) {
      return res.status(404).json({ error: "Not found" });
    }

    const access = await resolveCalendarAccess(user.id, existing.ownerUserId, isSuperAdmin);
    if (!access) {
      return res.status(403).json({ error: "Not allowed to view this entry" });
    }

    const durationMs = existing.endAt.getTime() - existing.startAt.getTime();
    const startAt = parsed.data.startAt ? new Date(parsed.data.startAt) : new Date(existing.startAt);
    const endAt = parsed.data.endAt
      ? new Date(parsed.data.endAt)
      : new Date(startAt.getTime() + durationMs);
    if (endAt.getTime() <= startAt.getTime()) {
      return res.status(400).json({ error: "endAt must be after startAt" });
    }

    const row = await prisma.vendorCalendarEntry.create({
      data: {
        catererId: caterer.id,
        ownerUserId: user.id,
        title: existing.title,
        notes: existing.isPrivate ? null : existing.notes,
        location: existing.location,
        startAt,
        endAt,
        allDay: existing.allDay,
        showAs: existing.showAs,
        isPrivate: false,
        recurrenceFreq: "none",
        recurrenceInterval: 1,
        recurrenceDaysOfWeek: null,
        recurrenceEndAt: null,
        recurrenceCount: null,
        reminderMinutesBefore: existing.reminderMinutesBefore,
        meetingUrl: existing.meetingUrl,
        colorHex: existing.colorHex
      },
      select: entrySelect
    });

    return res.status(201).json(serializeEntry(row, { hidePrivateNotes: false }));
  } catch (e) {
    return handleRouteError(res, e, "Vendor calendar copy");
  }
});

/**
 * Directory of calendars the viewer can open:
 * - always: self
 * - grants: targets shared with me
 * - super admin: all caterers + users (optional search)
 */
router.get("/directory", async (req: Request, res: Response) => {
  try {
    const { user, caterer, isSuperAdmin } = await getAuthorizedSession(req, "vendor_calendar:read");
    const q =
      typeof req.query.q === "string" && req.query.q.trim()
        ? req.query.q.trim().toLowerCase()
        : null;

    const grants = await prisma.calendarShareGrant.findMany({
      where: { granteeUserId: user.id },
      select: {
        id: true,
        scope: true,
        target: { select: { id: true, name: true, email: true } }
      }
    });

    const shared = grants.map((g) => ({
      userId: g.target.id,
      name: g.target.name,
      email: g.target.email,
      scope: g.scope,
      source: "grant" as const
    }));

    const self = {
      userId: user.id,
      name: user.name ?? null,
      email: user.email ?? "",
      scope: "owner" as const,
      source: "self" as const,
      catererId: caterer.id,
      catererName: caterer.name
    };

    if (!isSuperAdmin) {
      return res.json({ self, shared, caterers: [], pendingExternalInvites: [], isSuperAdmin: false });
    }

    const caterers = await prisma.caterer.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } }
            ]
          }
        : undefined,
      take: 100,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        userId: true,
        user: { select: { id: true, name: true, email: true } },
        teamMembers: {
          where: {
            OR: [
              { inviteStatus: "accepted", userId: { not: null } },
              { inviteStatus: "pending", role: "calendar_only" }
            ]
          },
          select: {
            userId: true,
            role: true,
            email: true,
            name: true,
            inviteStatus: true
          },
          take: 50
        }
      }
    });

    const pendingRows = await prisma.teamMember.findMany({
      where: { role: "calendar_only", inviteStatus: "pending" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true
      }
    });

    const pendingExternalInvites: typeof pendingRows = [];
    for (const row of pendingRows) {
      if (await expirePendingInviteIfNeeded(row)) continue;
      pendingExternalInvites.push(row);
    }

    return res.json({
      self,
      shared,
      isSuperAdmin: true,
      pendingExternalInvites: pendingExternalInvites.map((m) => ({
        id: m.id,
        email: m.email,
        name: m.name,
        createdAt: m.createdAt.toISOString(),
        expiresAt: inviteExpiresAt(m.createdAt).toISOString()
      })),
      caterers: caterers.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        users: [
          ...(c.user
            ? [{ userId: c.user.id, name: c.user.name, email: c.user.email, role: "owner" as const }]
            : []),
          ...c.teamMembers
            .filter((m) => m.userId)
            .map((m) => ({
              userId: m.userId!,
              name: m.name,
              email: m.email,
              role: m.role
            }))
        ]
      }))
    });
  } catch (e) {
    return handleRouteError(res, e, "Vendor calendar directory");
  }
});

/** Super admin: list share grants */
router.get("/grants", async (req: Request, res: Response) => {
  try {
    const { isSuperAdmin } = await getSession(req);
    requireSuperAdmin(isSuperAdmin);

    const grants = await prisma.calendarShareGrant.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        scope: true,
        createdAt: true,
        grantee: { select: { id: true, name: true, email: true } },
        target: { select: { id: true, name: true, email: true } },
        grantedBy: { select: { id: true, name: true, email: true } }
      }
    });

    return res.json({
      items: grants.map((g) => ({
        id: g.id,
        scope: g.scope,
        createdAt: g.createdAt.toISOString(),
        grantee: g.grantee,
        target: g.target,
        grantedBy: g.grantedBy
      }))
    });
  } catch (e) {
    return handleRouteError(res, e, "Calendar grants");
  }
});

/** Super admin: create / upsert share grant */
router.post("/grants", async (req: Request, res: Response) => {
  try {
    const { user, isSuperAdmin, caterer } = await getSession(req);
    requireSuperAdmin(isSuperAdmin);

    const parsed = grantBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const { granteeUserId, targetUserId } = parsed.data;
    if (granteeUserId === targetUserId) {
      return res.status(400).json({ error: "Cannot grant a user access to their own calendar" });
    }

    const [grantee, target] = await Promise.all([
      prisma.user.findUnique({ where: { id: granteeUserId }, select: { id: true, email: true } }),
      prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, email: true } })
    ]);
    if (!grantee || !target) {
      return res.status(404).json({ error: "User not found" });
    }

    const scope = (parsed.data.scope ?? "view") as CalendarShareScope;
    const grant = await prisma.calendarShareGrant.upsert({
      where: {
        granteeUserId_targetUserId: { granteeUserId, targetUserId }
      },
      create: {
        granteeUserId,
        targetUserId,
        scope,
        grantedByUserId: user.id
      },
      update: {
        scope,
        grantedByUserId: user.id
      },
      select: {
        id: true,
        scope: true,
        createdAt: true,
        grantee: { select: { id: true, name: true, email: true } },
        target: { select: { id: true, name: true, email: true } }
      }
    });

    await prisma.auditLog.create({
      data: {
        catererId: caterer.id,
        actorId: user.id,
        actorEmail: user.email ?? undefined,
        action: "calendar_share_grant",
        entityType: "CalendarShareGrant",
        entityId: grant.id,
        summary: `Granted ${grantee.email} ${scope} access to ${target.email}'s vendor calendar`,
        metadata: { granteeUserId, targetUserId, scope }
      }
    });

    return res.status(201).json({
      id: grant.id,
      scope: grant.scope,
      createdAt: grant.createdAt.toISOString(),
      grantee: grant.grantee,
      target: grant.target
    });
  } catch (e) {
    return handleRouteError(res, e, "Calendar grant create");
  }
});

/** Super admin: revoke share grant */
router.delete("/grants/:id", async (req: Request, res: Response) => {
  try {
    const { user, isSuperAdmin, caterer } = await getSession(req);
    requireSuperAdmin(isSuperAdmin);
    const id = paramId(req);

    const existing = await prisma.calendarShareGrant.findUnique({
      where: { id },
      select: {
        id: true,
        scope: true,
        grantee: { select: { email: true } },
        target: { select: { email: true } }
      }
    });
    if (!existing) {
      return res.status(404).json({ error: "Not found" });
    }

    await prisma.calendarShareGrant.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        catererId: caterer.id,
        actorId: user.id,
        actorEmail: user.email ?? undefined,
        action: "calendar_share_revoke",
        entityType: "CalendarShareGrant",
        entityId: id,
        summary: `Revoked ${existing.grantee.email}'s ${existing.scope} access to ${existing.target.email}'s vendor calendar`
      }
    });

    return res.status(204).send();
  } catch (e) {
    return handleRouteError(res, e, "Calendar grant delete");
  }
});

/** Super admin: invite external vendor calendar-only user by email */
router.post("/external-invites", async (req: Request, res: Response) => {
  try {
    const { user, isSuperAdmin } = await getSession(req);
    requireSuperAdmin(isSuperAdmin);

    const parsed = externalInviteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const caterer = await getExternalVendorCaterer();

    const existing = await prisma.teamMember.findUnique({
      where: { catererId_email: { catererId: caterer.id, email } }
    });

    if (existing?.inviteStatus === "accepted" && existing.role === "calendar_only") {
      return res.status(409).json({ error: "This email already has vendor calendar access." });
    }
    if (existing?.inviteStatus === "accepted" && existing.role !== "calendar_only") {
      return res.status(409).json({ error: "This email is already a team member with full dashboard access." });
    }

    const inviteToken = crypto.randomBytes(32).toString("hex");
    const member = existing
      ? await prisma.teamMember.update({
          where: { id: existing.id },
          data: {
            role: "calendar_only",
            inviteToken,
            inviteStatus: "pending",
            invitedBy: user.id,
            name: parsed.data.name?.trim() || existing.name,
            userId: null,
            joinedAt: null,
            createdAt: freshInviteSentAt()
          }
        })
      : await prisma.teamMember.create({
          data: {
            catererId: caterer.id,
            email,
            name: parsed.data.name?.trim() || null,
            role: "calendar_only",
            inviteToken,
            inviteStatus: "pending",
            invitedBy: user.id
          }
        });

    const acceptUrl = `${webOrigin()}/invite/${inviteToken}`;
    const mail = await sendVendorCalendarExternalInviteEmail({
      to: email,
      inviteeName: member.name,
      acceptUrl,
      expiresAt: inviteExpiresAt(member.createdAt)
    });

    const existingAccountHasFullAccess = await emailHasExistingFullDashboardAccess(email);

    return res.status(201).json({
      invite: {
        id: member.id,
        email: member.email,
        name: member.name,
        inviteStatus: member.inviteStatus,
        createdAt: member.createdAt.toISOString(),
        expiresAt: inviteExpiresAt(member.createdAt).toISOString()
      },
      emailSent: mail.sent,
      existingAccountHasFullAccess
    });
  } catch (e) {
    return handleRouteError(res, e, "External calendar invite");
  }
});

/** Super admin: list pending external calendar invites */
router.get("/external-invites", async (req: Request, res: Response) => {
  try {
    const { isSuperAdmin } = await getSession(req);
    requireSuperAdmin(isSuperAdmin);

    const items = await prisma.teamMember.findMany({
      where: { role: "calendar_only", inviteStatus: "pending" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true
      }
    });

    const active: typeof items = [];
    for (const item of items) {
      if (await expirePendingInviteIfNeeded(item)) continue;
      active.push(item);
    }

    return res.json({
      items: active.map((m) => ({
        id: m.id,
        email: m.email,
        name: m.name,
        createdAt: m.createdAt.toISOString(),
        expiresAt: inviteExpiresAt(m.createdAt).toISOString()
      }))
    });
  } catch (e) {
    return handleRouteError(res, e, "External calendar invites list");
  }
});

/** Super admin: revoke pending or accepted external calendar access */
router.delete("/external-invites/:id", async (req: Request, res: Response) => {
  try {
    const { isSuperAdmin } = await getSession(req);
    requireSuperAdmin(isSuperAdmin);
    const id = paramId(req);

    const existing = await prisma.teamMember.findFirst({
      where: { id, role: "calendar_only" }
    });
    if (!existing) {
      return res.status(404).json({ error: "Not found" });
    }

    const userId = existing.userId;
    await prisma.teamMember.delete({ where: { id } });

    if (userId) {
      await revokeCalendarOnlyAccessIfOrphaned(userId);
    }

    return res.status(204).send();
  } catch (e) {
    return handleRouteError(res, e, "External calendar invite revoke");
  }
});

/** Read-only iCal/webcal feed (token auth — no session cookie). */
router.get("/feed/:token", async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token ?? "").replace(/\.ics$/i, "");
    if (!token) return res.status(404).send("Not found");

    const user = await prisma.user.findFirst({
      where: { vendorCalendarIcalToken: token },
      select: { id: true, name: true, email: true }
    });
    if (!user) return res.status(404).send("Not found");

    const start = new Date();
    const end = new Date(start.getTime() + MAX_RANGE_MS);
    const events = await collectIcalEventsForOwner(user.id, start, end);
    const ics = buildIcalCalendar(events, `${user.name ?? user.email} — Vendor Calendar`);

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.send(ics);
  } catch (e) {
    return handleRouteError(res, e, "Vendor calendar feed");
  }
});

/** Authenticated export for visible calendar range. */
async function handleIcalExport(req: Request, res: Response) {
  try {
    const { user, caterer, isSuperAdmin } = await getAuthorizedSession(req, "vendor_calendar:read");
    const range = parseRange(req);
    if ("error" in range) {
      return res.status(400).json({ error: range.error });
    }

    const ownerUserIdParam =
      typeof req.query.ownerUserId === "string" && req.query.ownerUserId.trim()
        ? req.query.ownerUserId.trim()
        : null;
    const catererIdParam =
      typeof req.query.catererId === "string" && req.query.catererId.trim()
        ? req.query.catererId.trim()
        : null;

    let ownerWhere = await buildOwnerWhere(user, caterer, isSuperAdmin, ownerUserIdParam, catererIdParam);
    if ("error" in ownerWhere) {
      return res.status(ownerWhere.status).json({ error: ownerWhere.error });
    }

    const targetUserId =
      ownerUserIdParam ??
      (typeof ownerWhere.ownerUserId === "string" ? ownerWhere.ownerUserId : user.id);

    const events = await collectIcalEventsForOwner(targetUserId, range.start, range.end);
    const ics = buildIcalCalendar(events, "Vendor Calendar export");

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="vendor-calendar.ics"');
    return res.send(ics);
  } catch (e) {
    return handleRouteError(res, e, "Vendor calendar export");
  }
}

router.get("/export", handleIcalExport);
router.get("/export.ics", handleIcalExport);

/** Create or return iCal subscription token for the current user. */
router.post("/ical-token", async (req: Request, res: Response) => {
  try {
    const { user } = await getAuthorizedSession(req, "vendor_calendar:read");

    const existing = await prisma.user.findUnique({
      where: { id: user.id },
      select: { vendorCalendarIcalToken: true }
    });

    let token = existing?.vendorCalendarIcalToken;
    if (!token) {
      token = generateIcalToken();
      await prisma.user.update({
        where: { id: user.id },
        data: { vendorCalendarIcalToken: token }
      });
    }

    const webOrigin = process.env.WEB_ORIGIN?.replace(/\/$/, "") ?? "http://localhost:3000";
    const subscribeUrl = `${webOrigin}/api/vendor-calendar/feed/${token}`;
    const webcalUrl = subscribeUrl.replace(/^https?:\/\//, "webcal://");

    return res.json({ token, subscribeUrl, webcalUrl });
  } catch (e) {
    return handleRouteError(res, e, "Vendor calendar iCal token");
  }
});

/** Cron endpoint: dispatch due reminder emails (requires x-cron-secret header). */
router.post("/reminders/dispatch", async (req: Request, res: Response) => {
  try {
    const secret = process.env.VENDOR_CALENDAR_CRON_SECRET?.trim();
    const header = req.headers["x-cron-secret"];
    const provided = Array.isArray(header) ? header[0] : header;
    if (!secret || provided !== secret) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await dispatchDueVendorCalendarReminders();
    return res.json(result);
  } catch (e) {
    return handleRouteError(res, e, "Vendor calendar reminder dispatch");
  }
});

router.use("/google", vendorCalendarGoogleRouter);

export { router as vendorCalendarRouter };
