import crypto from "node:crypto";

import { prisma, type TeamRole } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";

import { escapeHtml, getResend, resendFromEmail } from "../lib/mail";
import { canAssignRole, requirePermission } from "../lib/permissions";
import { clearCatererCacheForUser, getSession, SessionError } from "../lib/session";

const router = Router();
const inviteRouter = Router();

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ASSIGNABLE_ROLES: TeamRole[] = ["admin", "manager", "sales", "ops", "viewer"];

function paramId(req: Request, key = "memberId"): string {
  const raw = req.params[key];
  return Array.isArray(raw) ? raw[0]! : String(raw);
}

function handleSessionError(res: Response, e: unknown) {
  if (e instanceof SessionError) {
    return res.status(e.status).json({ error: e.message });
  }
  const status = e && typeof e === "object" && "status" in e ? Number((e as { status: number }).status) : 500;
  if (status === 403) {
    return res.status(403).json({ error: (e as Error).message });
  }
  console.error("Team route error:", e);
  return res.status(500).json({ error: "Internal server error" });
}

function serializeMember(member: {
  id: string;
  email: string;
  role: TeamRole;
  inviteStatus: string;
  joinedAt: Date | null;
  createdAt: Date;
  userId: string | null;
}) {
  return {
    id: member.id,
    email: member.email,
    role: member.role,
    inviteStatus: member.inviteStatus,
    joinedAt: member.joinedAt?.toISOString() ?? null,
    createdAt: member.createdAt.toISOString(),
    userId: member.userId
  };
}

function webOrigin(): string {
  return process.env.WEB_ORIGIN?.trim() || process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3000";
}

router.get("/me", async (req: Request, res: Response) => {
  try {
    const { role, caterer, user } = await getSession(req);
    return res.json({
      role,
      catererName: caterer.name,
      isTeamMember: caterer.userId !== user.id
    });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const { caterer, role, user } = await getSession(req);
    requirePermission(role, "team:read");

    const members = await prisma.teamMember.findMany({
      where: { catererId: caterer.id },
      orderBy: [{ inviteStatus: "asc" }, { createdAt: "asc" }]
    });

    const ownerEntry = {
      id: "owner",
      email: caterer.email,
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
    return handleSessionError(res, e);
  }
});

router.post("/invite", async (req: Request, res: Response) => {
  try {
    const { caterer, role, user } = await getSession(req);
    requirePermission(role, "team:write");

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
            userId: null
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
        html: `<p>You've been invited to join <strong>${escapeHtml(caterer.name)}</strong> on CaterPro as <strong>${escapeHtml(targetRole)}</strong>.</p><p><a href="${escapeHtml(acceptUrl)}">Accept invitation</a></p><p>This link expires in 7 days.</p>`
      });
    }

    return res.status(201).json({ member: serializeMember(member) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.patch("/:memberId/role", async (req: Request, res: Response) => {
  try {
    const { caterer, role } = await getSession(req);
    requirePermission(role, "team:write");

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

    const updated = await prisma.teamMember.update({
      where: { id: memberId },
      data: { role: targetRole }
    });

    return res.json({ member: serializeMember(updated) });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

router.delete("/:memberId", async (req: Request, res: Response) => {
  try {
    const { caterer, role, user } = await getSession(req);
    requirePermission(role, "team:write");

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
    return res.json({ ok: true });
  } catch (e) {
    return handleSessionError(res, e);
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

    const expired = Date.now() - member.createdAt.getTime() > INVITE_TTL_MS;
    if (expired) {
      await prisma.teamMember.update({
        where: { id: member.id },
        data: { inviteStatus: "expired", inviteToken: null }
      });
      return res.status(410).json({ error: "Invitation expired." });
    }

    return res.json({
      email: member.email,
      role: member.role,
      catererName: member.caterer.name,
      token
    });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

inviteRouter.post("/:token/accept", async (req: Request, res: Response) => {
  try {
    const token = paramId(req, "token");
    const { user } = await getSession(req);

    const invite = await prisma.teamMember.findUnique({
      where: { inviteToken: token }
    });

    if (!invite || invite.inviteStatus !== "pending") {
      return res.status(404).json({ error: "Invitation not found." });
    }

    const expired = Date.now() - invite.createdAt.getTime() > INVITE_TTL_MS;
    if (expired) {
      await prisma.teamMember.update({
        where: { id: invite.id },
        data: { inviteStatus: "expired", inviteToken: null }
      });
      return res.status(410).json({ error: "Invitation expired." });
    }

    if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
      return res.status(403).json({ error: "Sign in with the invited email to accept." });
    }

    const updated = await prisma.teamMember.update({
      where: { id: invite.id },
      data: {
        userId: user.id,
        inviteStatus: "accepted",
        inviteToken: null,
        joinedAt: new Date()
      }
    });

    clearCatererCacheForUser(user.id);

    return res.json({ member: serializeMember(updated), redirect: "/dashboard" });
  } catch (e) {
    return handleSessionError(res, e);
  }
});

export { router as teamRouter, inviteRouter };
