import { prisma } from "@tripeseats/database";

const DEFAULT_INVITE_TTL_DAYS = 7;

export function inviteTtlDays(): number {
  const raw = process.env.INVITE_TTL_DAYS?.trim();
  const parsed = raw ? Number(raw) : DEFAULT_INVITE_TTL_DAYS;
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 90) {
    return DEFAULT_INVITE_TTL_DAYS;
  }
  return Math.floor(parsed);
}

export function inviteTtlMs(): number {
  return inviteTtlDays() * 24 * 60 * 60 * 1000;
}

export function inviteExpiresAt(sentAt: Date): Date {
  return new Date(sentAt.getTime() + inviteTtlMs());
}

export function isInviteExpired(sentAt: Date, now = Date.now()): boolean {
  return now > inviteExpiresAt(sentAt).getTime();
}

export function inviteExpiryLabel(sentAt: Date): string {
  return inviteExpiresAt(sentAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

/** Mark a pending invite expired when past TTL. Returns true if expired. */
export async function expirePendingInviteIfNeeded(member: {
  id: string;
  createdAt: Date;
  inviteStatus?: string;
}): Promise<boolean> {
  if (member.inviteStatus && member.inviteStatus !== "pending") return false;
  if (!isInviteExpired(member.createdAt)) return false;

  await prisma.teamMember.update({
    where: { id: member.id },
    data: { inviteStatus: "expired", inviteToken: null }
  });
  return true;
}

/** Fresh TTL clock when (re)sending an invitation. */
export function freshInviteSentAt(): Date {
  return new Date();
}
