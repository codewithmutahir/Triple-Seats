import crypto from "node:crypto";

import { prisma, type TeamRole } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { AUDIT_ACTIONS, serializeAuditLog, writeAuditLog } from "../lib/audit-log";
import { getAuthorizedSession } from "../lib/authorized-session";
import { escapeHtml, getResend, resendFromEmail } from "../lib/mail";
import { canAssignRole, isCalendarOnlyRole } from "../lib/permissions";
import {
  expirePendingInviteIfNeeded,
  inviteExpiresAt,
  inviteTtlDays,
  freshInviteSentAt
} from "../lib/invite-ttl";
import { handleRouteError } from "../lib/route-errors";
import {
  applyCalendarOnlyAccess,
  emailHasExistingFullDashboardAccess,
  revokeCalendarOnlyAccessIfOrphaned
} from "../lib/calendar-only-session";
import { authenticateInviteEmail, emailHasAccount, magicLinkExpiresMinutes, sendInviteMagicLink } from "../lib/invite-complete";
import { clearCatererCacheForUser, getAuthSession, getSession } from "../lib/session";
import { resolveIsSuperAdmin } from "../lib/super-admin";
import { userHasPassword } from "../lib/user-has-password";
import { z } from "zod";

const router = Router();
const inviteRouter = Router();

const ASSIGNABLE_ROLES: TeamRole[] = ["admin", "manager", "sales", "ops", "viewer"];

const profileSchema = {
  parse(body: unknown) {
    if (!body || typeof body !== "object") return { success: false as const };
    const b = body as Record<string, unknown>;
    const str = (v: unknown, max: number) => {
      if (v === undefined || v === null) return null;
      if (typeof v !== "string") return undefined;
      const t = v.trim();
      return t.length > max ? t.slice(0, max) : t;
    };
    const name = str(b.name, 120);
    const phone = str(b.phone, 40);
    const jobTitle = str(b.jobTitle, 120);
    if (name === undefined || phone === undefined || jobTitle === undefined) {
      return { success: false as const };
    }
    return { success: true as const, data: { name, phone, jobTitle } };
  }
};

function paramId(req: Request, key = "memberId"): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0]! : String(raw);
}

function serializeMember(member: {
  id: string;
  email: string;
  role: TeamRole;
  inviteStatus: string;
  joinedAt: Date | null;
  createdAt: Date;
  userId: string | null;
  name?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
}) {
  return {
    id: member.id,
    email: member.email,
    role: member.role,
    inviteStatus: member.inviteStatus,
    joinedAt: member.joinedAt?.toISOString() ?? null,
    createdAt: member.createdAt.toISOString(),
    userId: member.userId,
    name: member.name ?? null,
    phone: member.phone ?? null,
    jobTitle: member.jobTitle ?? null
  };
}

function webOrigin(): string {
  return process.env.WEB_ORIGIN?.trim() || process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3000";
}

const inviteCompleteBodySchema = z.object({
  password: z.string().min(8).max(128),
  name: z.string().trim().max(120).optional(),
  acknowledgeLimitedAccess: z.boolean().optional()
});

async function loadPendingInvite(token: string) {
  const invite = await prisma.teamMember.findUnique({
    where: { inviteToken: token },
    include: { caterer: { select: { id: true, name: true } } }
  });
  if (!invite || invite.inviteStatus !== "pending") return null;
  if (await expirePendingInviteIfNeeded(invite)) return "expired" as const;
  return invite;
}

async function finalizeInviteAccept(
  invite: {
    id: string;
    email: string;
    role: TeamRole;
    name: string | null;
    caterer: { id: string; name: string };
  },
  user: { id: string; email: string; name?: string | null },
  isSuperAdmin: boolean
) {
  const updated = await prisma.teamMember.update({
    where: { id: invite.id },
    data: {
      userId: user.id,
      inviteStatus: "accepted",
      inviteToken: null,
      joinedAt: new Date(),
      name: user.name ?? invite.name
    }
  });

  if (invite.role === "calendar_only" && !isSuperAdmin) {
    await applyCalendarOnlyAccess(user.id);
  } else {
    clearCatererCacheForUser(user.id);
  }

  await writeAuditLog({
    catererId: invite.caterer.id,
    actorId: user.id,
    actorEmail: user.email,
    action: AUDIT_ACTIONS.TEAM_INVITE_ACCEPT,
    entityType: "team_member",
    entityId: invite.id,
    summary: `${user.email} accepted invitation as ${invite.role}`,
    metadata: { email: invite.email, role: invite.role }
  });

  return {
    member: serializeMember(updated),
    redirect: invite.role === "calendar_only" ? "/dashboard/vendor-calendar" : "/dashboard"
  };
}

router.get("/me", async (req: Request, res: Response) => {
  try {
    const { role, caterer, isOwner, isSuperAdmin, user } = await getSession(req);
    const hasPassword = await userHasPassword(user.id);
    return res.json({
      role,
      catererName: isCalendarOnlyRole(role) ? "Vendor calendar" : caterer.name,
      isTeamMember: !isOwner,
      isOwner,
      isSuperAdmin,
      isCalendarOnly: isCalendarOnlyRole(role),
      hasPassword
    });
  } catch (e) {
    return handleRouteError(res, e, "Team me");
  }
});

router.get("/activity", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "team:read");
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);

    const logs = await prisma.auditLog.findMany({
      where: { catererId: caterer.id },
      orderBy: { createdAt: "desc" },
      take: limit
    });

    return res.json({ logs: logs.map(serializeAuditLog) });
  } catch (e) {
    return handleRouteError(res, e, "Team activity");
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "team:read");

    const members = await prisma.teamMember.findMany({
      where: { catererId: caterer.id },
      orderBy: [{ inviteStatus: "asc" }, { createdAt: "asc" }]
    });

    let ownerName: string | null = null;
    if (caterer.userId) {
      const ownerUser = await prisma.user.findUnique({
        where: { id: caterer.userId },
        select: { name: true }
      });
      ownerName = ownerUser?.name ?? null;
    }

    const ownerEntry = {
      id: "owner",
      email: caterer.email,
      name: ownerName,
      phone: caterer.phone ?? null,
      jobTitle: "Account Owner",
      role: "owner" as TeamRole,
      inviteStatus: "accepted",
      joinedAt: caterer.createdAt.toISOString(),
      createdAt: caterer.createdAt.toISOString(),
      userId: caterer.userId,
      isOwner: true
    };

    return res.json({
      members: [ownerEntry, ...members.map((m) => ({ ...serializeMember(m), isOwner: false }))]
    });
  } catch (e) {
    return handleRouteError(res, e, "Team list");
  }
});

router.post("/invite", async (req: Request, res: Response) => {
  try {
    const { caterer, role, user } = await getAuthorizedSession(req, "team:write");

    const body = req.body as { email?: string; role?: TeamRole };
    const email = body.email?.trim().toLowerCase();
    const targetRole = body.role;

    if (!email || !targetRole || !ASSIGNABLE_ROLES.includes(targetRole)) {
      return res.status(400).json({ error: "Invalid email or role." });
    }

    if (!canAssignRole(role, targetRole)) {
      return res.status(403).json({ error: "Cannot invite with a role higher than your own." });
    }

    if (email === caterer.email.toLowerCase()) {
      return res.status(400).json({ error: "This user is already the account owner." });
    }

    const existing = await prisma.teamMember.findUnique({
      where: { catererId_email: { catererId: caterer.id, email } }
    });
    if (existing && existing.inviteStatus === "accepted") {
      return res.status(409).json({ error: "This email is already on the team." });
    }

    const inviteToken = crypto.randomBytes(32).toString("hex");

    const member = existing
      ? await prisma.teamMember.update({
          where: { id: existing.id },
          data: {
            role: targetRole,
            inviteToken,
            inviteStatus: "pending",
            invitedBy: user.id,
            joinedAt: null,
            userId: null,
            createdAt: freshInviteSentAt()
          }
        })
      : await prisma.teamMember.create({
          data: {
            catererId: caterer.id,
            email,
            role: targetRole,
            inviteToken,
            inviteStatus: "pending",
            invitedBy: user.id
          }
        });

    const acceptUrl = `${webOrigin()}/invite/${inviteToken}`;
    const resend = getResend();
    if (resend) {
      await resend.emails.send({
        from: resendFromEmail(),
        to: email,
        subject: "You've been invited to join CaterPro",
        html: `<p>You've been invited to join <strong>${escapeHtml(caterer.name)}</strong> on CaterPro as <strong>${escapeHtml(targetRole)}</strong>.</p><p><a href="${escapeHtml(acceptUrl)}">Accept invitation</a></p><p>This link expires in ${inviteTtlDays()} days.</p>`
      });
    }

    await writeAuditLog({
      catererId: caterer.id,
      actorId: user.id,
      actorEmail: user.email,
      action: AUDIT_ACTIONS.TEAM_INVITE,
      entityType: "team_member",
      entityId: member.id,
      summary: `Invited ${email} as ${targetRole}`,
      metadata: { email, role: targetRole }
    });

    return res.status(201).json({ member: serializeMember(member) });
  } catch (e) {
    return handleRouteError(res, e, "Team invite");
  }
});

router.patch("/:memberId/profile", async (req: Request, res: Response) => {
  try {
    const { caterer, user } = await getAuthorizedSession(req, "team:write");

    const memberId = paramId(req);
    const parsed = profileSchema.parse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid profile data." });
    }

    const member = await prisma.teamMember.findFirst({
      where: { id: memberId, catererId: caterer.id }
    });
    if (!member) {
      return res.status(404).json({ error: "Member not found." });
    }

    const nextName = parsed.data.name ?? null;
    const nextPhone = parsed.data.phone ?? null;
    const nextJobTitle = parsed.data.jobTitle ?? null;

    if (
      (member.name ?? null) === nextName &&
      (member.phone ?? null) === nextPhone &&
      (member.jobTitle ?? null) === nextJobTitle
    ) {
      return res.json({ member: serializeMember(member), unchanged: true });
    }

    const updated = await prisma.teamMember.update({
      where: { id: memberId },
      data: {
        name: nextName,
        phone: nextPhone,
        jobTitle: nextJobTitle
      }
    });

    await writeAuditLog({
      catererId: caterer.id,
      actorId: user.id,
      actorEmail: user.email,
      action: AUDIT_ACTIONS.TEAM_PROFILE_UPDATE,
      entityType: "team_member",
      entityId: member.id,
      summary: `Updated profile for ${member.email}`,
      metadata: parsed.data
    });

    return res.json({ member: serializeMember(updated) });
  } catch (e) {
    return handleRouteError(res, e, "Team profile");
  }
});

router.patch("/:memberId/role", async (req: Request, res: Response) => {
  try {
    const { caterer, role, user } = await getAuthorizedSession(req, "team:write");

    const memberId = paramId(req);
    const targetRole = (req.body as { role?: TeamRole }).role;

    if (!targetRole || !ASSIGNABLE_ROLES.includes(targetRole)) {
      return res.status(400).json({ error: "Invalid role." });
    }

    if (!canAssignRole(role, targetRole)) {
      return res.status(403).json({ error: "Cannot assign a role higher than your own." });
    }

    const member = await prisma.teamMember.findFirst({
      where: { id: memberId, catererId: caterer.id }
    });
    if (!member) {
      return res.status(404).json({ error: "Member not found." });
    }
    if (member.role === "owner") {
      return res.status(403).json({ error: "Cannot change owner role." });
    }

    if (member.role === targetRole) {
      return res.json({ member: serializeMember(member), unchanged: true });
    }

    const updated = await prisma.teamMember.update({
      where: { id: memberId },
      data: { role: targetRole }
    });

    await writeAuditLog({
      catererId: caterer.id,
      actorId: user.id,
      actorEmail: user.email,
      action: AUDIT_ACTIONS.TEAM_ROLE_CHANGE,
      entityType: "team_member",
      entityId: member.id,
      summary: `Changed role for ${member.email} from ${member.role} to ${targetRole}`,
      metadata: { email: member.email, from: member.role, to: targetRole }
    });

    return res.json({ member: serializeMember(updated) });
  } catch (e) {
    return handleRouteError(res, e, "Team role");
  }
});

router.delete("/:memberId", async (req: Request, res: Response) => {
  try {
    const { caterer, user } = await getAuthorizedSession(req, "team:write");

    const memberId = paramId(req);
    const member = await prisma.teamMember.findFirst({
      where: { id: memberId, catererId: caterer.id }
    });

    if (!member) {
      return res.status(404).json({ error: "Member not found." });
    }
    if (member.role === "owner") {
      return res.status(403).json({ error: "Cannot remove owner." });
    }
    if (member.userId === user.id) {
      return res.status(403).json({ error: "Cannot remove yourself." });
    }

    await prisma.teamMember.delete({ where: { id: memberId } });

    await writeAuditLog({
      catererId: caterer.id,
      actorId: user.id,
      actorEmail: user.email,
      action: AUDIT_ACTIONS.TEAM_REMOVE,
      entityType: "team_member",
      entityId: member.id,
      summary: `Removed ${member.email} (${member.role})`,
      metadata: { email: member.email, role: member.role }
    });

    return res.json({ ok: true });
  } catch (e) {
    return handleRouteError(res, e, "Team remove");
  }
});

inviteRouter.get("/my-pending", async (req: Request, res: Response) => {
  try {
    const { user } = await getAuthSession(req);
    const email = user.email?.trim().toLowerCase();
    if (!email) {
      return res.json({ pending: null });
    }

    const pending = await prisma.teamMember.findFirst({
      where: { email, inviteStatus: "pending" },
      orderBy: { createdAt: "desc" },
      select: { id: true, inviteToken: true, role: true, createdAt: true, inviteStatus: true }
    });

    if (!pending?.inviteToken) {
      return res.json({ pending: null });
    }

    if (await expirePendingInviteIfNeeded(pending)) {
      return res.json({ pending: null });
    }

    return res.json({
      pending: {
        token: pending.inviteToken,
        role: pending.role
      }
    });
  } catch {
    return res.json({ pending: null });
  }
});

inviteRouter.get("/:token", async (req: Request, res: Response) => {
  try {
    const token = paramId(req, "token");
    const member = await prisma.teamMember.findUnique({
      where: { inviteToken: token },
      include: { caterer: { select: { name: true } } }
    });

    if (!member || member.inviteStatus !== "pending") {
      return res.status(404).json({ error: "Invitation not found." });
    }

    if (await expirePendingInviteIfNeeded(member)) {
      return res.status(410).json({ error: "Invitation expired." });
    }

    const existingAccountHasFullAccess =
      member.role === "calendar_only"
        ? await emailHasExistingFullDashboardAccess(member.email)
        : false;
    const accountExists = await emailHasAccount(member.email);

    return res.json({
      email: member.email,
      role: member.role,
      catererName: member.caterer.name,
      token,
      expiresAt: inviteExpiresAt(member.createdAt).toISOString(),
      willLimitToCalendarOnly: member.role === "calendar_only",
      existingAccountHasFullAccess,
      accountExists,
      magicLinkExpiresMinutes: magicLinkExpiresMinutes()
    });
  } catch (e) {
    return handleRouteError(res, e, "Invite preview");
  }
});

inviteRouter.post("/:token/magic-link", async (req: Request, res: Response) => {
  try {
    const token = paramId(req, "token");
    const invite = await loadPendingInvite(token);
    if (invite === "expired") {
      return res.status(410).json({ error: "Invitation expired." });
    }
    if (!invite) {
      return res.status(404).json({ error: "Invitation not found." });
    }

    const result = await sendInviteMagicLink(req, {
      email: invite.email,
      name: invite.name,
      inviteToken: token
    });
    if (!result.sent) {
      return res.status(503).json({ error: result.error ?? "Could not send sign-in link." });
    }

    return res.json({ ok: true, email: invite.email });
  } catch (e) {
    return handleRouteError(res, e, "Invite magic link");
  }
});

inviteRouter.post("/:token/complete", async (req: Request, res: Response) => {
  try {
    const token = paramId(req, "token");
    const parsed = inviteCompleteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const invite = await loadPendingInvite(token);
    if (invite === "expired") {
      return res.status(410).json({ error: "Invitation expired." });
    }
    if (!invite) {
      return res.status(404).json({ error: "Invitation not found." });
    }

    const accountExists = await emailHasAccount(invite.email);
    const existingAccountHasFullAccess =
      invite.role === "calendar_only"
        ? await emailHasExistingFullDashboardAccess(invite.email)
        : false;

    if (existingAccountHasFullAccess && !parsed.data.acknowledgeLimitedAccess) {
      return res.status(400).json({
        error:
          "Confirm that you understand your dashboard will be limited to vendor calendar only."
      });
    }

    const authResult = await authenticateInviteEmail(req, res, {
      email: invite.email,
      password: parsed.data.password,
      name: parsed.data.name,
      accountExists
    });
    if ("error" in authResult) {
      return res.status(authResult.status).json({ error: authResult.error });
    }

    if (authResult.user.email.toLowerCase() !== invite.email.toLowerCase()) {
      return res.status(403).json({ error: "Sign in with the invited email to continue." });
    }

    const isSuperAdmin = await resolveIsSuperAdmin(authResult.user.id, authResult.user.email);
    const result = await finalizeInviteAccept(invite, authResult.user, isSuperAdmin);
    return res.json(result);
  } catch (e) {
    return handleRouteError(res, e, "Invite complete");
  }
});

inviteRouter.post("/:token/accept", async (req: Request, res: Response) => {
  try {
    const token = paramId(req, "token");
    const { user } = await getAuthSession(req);
    const isSuperAdmin = await resolveIsSuperAdmin(user.id, user.email ?? null);

    const invite = await loadPendingInvite(token);
    if (invite === "expired") {
      return res.status(410).json({ error: "Invitation expired." });
    }
    if (!invite) {
      return res.status(404).json({ error: "Invitation not found." });
    }

    if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
      return res.status(403).json({ error: "Sign in with the invited email to accept." });
    }

    const result = await finalizeInviteAccept(invite, user, isSuperAdmin);
    return res.json(result);
  } catch (e) {
    return handleRouteError(res, e, "Invite accept");
  }
});

export { router as teamRouter, inviteRouter };
