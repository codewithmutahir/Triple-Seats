import { prisma, type TeamRole } from "@tripeseats/database";

import { clearCatererCacheForUser } from "./session-cache";

type CatererRow = Awaited<ReturnType<typeof prisma.caterer.findFirst>> & object;

/** True if the user has (or had) normal dashboard access beyond vendor calendar only. */
export async function userHasFullDashboardAccess(userId: string): Promise<boolean> {
  const ownedCaterer = await prisma.caterer.findFirst({
    where: { userId },
    select: { id: true }
  });
  if (ownedCaterer) return true;

  const broaderTeam = await prisma.teamMember.findFirst({
    where: {
      userId,
      inviteStatus: "accepted",
      role: { not: "calendar_only" }
    },
    select: { id: true }
  });
  return Boolean(broaderTeam);
}

export async function emailHasExistingFullDashboardAccess(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  const user = await prisma.user.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
    select: { id: true }
  });
  if (!user) return false;

  return userHasFullDashboardAccess(user.id);
}

export async function resolveCalendarOnlyMembership(userId: string) {
  return prisma.teamMember.findFirst({
    where: {
      userId,
      role: "calendar_only",
      inviteStatus: "accepted"
    },
    orderBy: { joinedAt: "desc" },
    include: { caterer: true }
  });
}

export async function applyCalendarOnlyAccess(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { vendorCalendarOnly: true }
  });
  clearCatererCacheForUser(userId);
}

export async function revokeCalendarOnlyAccessIfOrphaned(userId: string) {
  const remaining = await prisma.teamMember.count({
    where: {
      userId,
      role: "calendar_only",
      inviteStatus: "accepted"
    }
  });
  if (remaining > 0) return;

  await prisma.user.update({
    where: { id: userId },
    data: { vendorCalendarOnly: false }
  });
  clearCatererCacheForUser(userId);
}

export type CalendarOnlySession = {
  caterer: NonNullable<CatererRow>;
  role: TeamRole;
  isOwner: false;
};

export async function tryResolveCalendarOnlySession(
  userId: string,
  isSuperAdmin: boolean
): Promise<CalendarOnlySession | null> {
  if (isSuperAdmin) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { vendorCalendarOnly: true }
  });
  if (!dbUser?.vendorCalendarOnly) return null;

  const membership = await resolveCalendarOnlyMembership(userId);
  if (!membership?.caterer) return null;

  return {
    caterer: membership.caterer,
    role: "calendar_only",
    isOwner: false
  };
}
