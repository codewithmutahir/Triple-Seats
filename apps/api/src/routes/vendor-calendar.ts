import {
  prisma,
  type CalendarShareScope,
  type CalendarShowAs,
  type Prisma
} from "@tripeseats/database";
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { getAuthorizedSession } from "../lib/authorized-session";
import { handleRouteError } from "../lib/route-errors";
import { getSession } from "../lib/session";
import { timer } from "../lib/perf";

const router = Router();

const MAX_RANGE_MS = 93 * 24 * 60 * 60 * 1000;

const SHOW_AS = ["busy", "free", "tentative", "oof"] as const;
const SHARE_SCOPES = ["view", "edit"] as const;

const SHOW_AS_COLORS: Record<CalendarShowAs, string> = {
  busy: "#1B2A4A",
  free: "#10B981",
  tentative: "#F59E0B",
  oof: "#6B7280"
};

const isoDateString = z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
  message: "Invalid ISO datetime"
});

const entryBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(10_000).nullable().optional(),
  location: z.string().trim().max(500).nullable().optional(),
  startAt: isoDateString,
  endAt: isoDateString,
  allDay: z.boolean().optional(),
  showAs: z.enum(SHOW_AS).optional(),
  isPrivate: z.boolean().optional()
});

const entryPatchSchema = entryBodySchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: "At least one field required" }
);

const grantBodySchema = z.object({
  granteeUserId: z.string().min(1),
  targetUserId: z.string().min(1),
  scope: z.enum(SHARE_SCOPES).optional()
});

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
  row: {
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
    createdAt: Date;
    updatedAt: Date;
    owner?: { id: string; name: string | null; email: string } | null;
  },
  opts: { hidePrivateNotes: boolean }
) {
  const hideNotes = opts.hidePrivateNotes && row.isPrivate;
  return {
    id: row.id,
    catererId: row.catererId,
    ownerUserId: row.ownerUserId,
    title: row.title,
    notes: hideNotes ? null : row.notes,
    location: row.location,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    allDay: row.allDay,
    showAs: row.showAs,
    isPrivate: row.isPrivate,
    color: SHOW_AS_COLORS[row.showAs],
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

    let where: Prisma.VendorCalendarEntryWhereInput = {
      ...rangeWhere(range.start, range.end)
    };

    if (catererIdParam) {
      if (!isSuperAdmin) {
        return res.status(403).json({ error: "Only super admin can filter by caterer" });
      }
      where = { ...where, catererId: catererIdParam };
      if (ownerUserIdParam) {
        where = { ...where, ownerUserId: ownerUserIdParam };
      }
    } else {
      const targetUserId = ownerUserIdParam ?? user.id;
      const access = await resolveCalendarAccess(user.id, targetUserId, isSuperAdmin);
      if (!access) {
        return res.status(403).json({ error: "Not allowed to view this calendar" });
      }
      where = { ...where, ownerUserId: targetUserId };
      // Non–super-admin viewing own calendar stays in tenant; shared views may cross tenants by ownerUserId
      if (targetUserId === user.id && !isSuperAdmin) {
        where = { ...where, catererId: caterer.id };
      }
    }

    const rows = await prisma.vendorCalendarEntry.findMany({
      where,
      orderBy: { startAt: "asc" },
      select: {
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
        createdAt: true,
        updatedAt: true,
        owner: { select: { id: true, name: true, email: true } }
      }
    });
    perf.step("db:query");

    const items = rows.map((row) => {
      const isOwnerOrSuper = row.ownerUserId === user.id || isSuperAdmin;
      return serializeEntry(row, { hidePrivateNotes: !isOwnerOrSuper });
    });

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
        isPrivate: parsed.data.isPrivate ?? false
      },
      select: {
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
        createdAt: true,
        updatedAt: true
      }
    });

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
        ownerUserId: true,
        startAt: true,
        endAt: true
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

    const row = await prisma.vendorCalendarEntry.update({
      where: { id },
      data,
      select: {
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
        createdAt: true,
        updatedAt: true
      }
    });

    return res.json(serializeEntry(row, { hidePrivateNotes: false }));
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
      select: { id: true, ownerUserId: true }
    });
    if (!existing) {
      return res.status(404).json({ error: "Not found" });
    }

    const access = await resolveCalendarAccess(user.id, existing.ownerUserId, isSuperAdmin);
    if (!canEdit(access)) {
      return res.status(403).json({ error: "Not allowed to delete this entry" });
    }

    await prisma.vendorCalendarEntry.delete({ where: { id } });
    return res.status(204).send();
  } catch (e) {
    return handleRouteError(res, e, "Vendor calendar delete");
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
      return res.json({ self, shared, caterers: [], isSuperAdmin: false });
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
          where: { inviteStatus: "accepted", userId: { not: null } },
          select: {
            userId: true,
            role: true,
            email: true,
            name: true
          },
          take: 50
        }
      }
    });

    return res.json({
      self,
      shared,
      isSuperAdmin: true,
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

export { router as vendorCalendarRouter };
