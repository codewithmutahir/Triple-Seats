import { prisma, type Prisma } from "@tripeseats/database";

export const AUDIT_ACTIONS = {
  TEAM_INVITE: "team.invite",
  TEAM_ROLE_CHANGE: "team.role_change",
  TEAM_REMOVE: "team.remove",
  TEAM_PROFILE_UPDATE: "team.profile_update",
  TEAM_INVITE_ACCEPT: "team.invite_accept"
} as const;

type WriteAuditInput = {
  catererId: string;
  actorId: string;
  actorEmail?: string | null;
  action: string;
  summary: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
};

export async function writeAuditLog(input: WriteAuditInput) {
  try {
    await prisma.auditLog.create({
      data: {
        catererId: input.catererId,
        actorId: input.actorId,
        actorEmail: input.actorEmail ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        summary: input.summary,
        metadata: input.metadata ?? undefined
      }
    });
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.error("Failed to write audit log:", e);
    }
  }
}

export function serializeAuditLog(row: {
  id: string;
  actorId: string;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    actorId: row.actorId,
    actorEmail: row.actorEmail,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    summary: row.summary,
    createdAt: row.createdAt.toISOString()
  };
}
