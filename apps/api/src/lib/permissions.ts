import type { TeamRole } from "@tripeseats/database";

export const ROLE_PERMISSIONS = {
  owner: [
    "leads:read",
    "leads:write",
    "events:read",
    "events:write",
    "quotes:read",
    "quotes:write",
    "bookings:read",
    "bookings:write",
    "tasks:read",
    "tasks:write",
    "discussions:read",
    "discussions:write",
    "reports:read",
    "settings:read",
    "settings:write",
    "team:read",
    "team:write",
    "billing:read",
    "billing:write"
  ],
  admin: [
    "leads:read",
    "leads:write",
    "events:read",
    "events:write",
    "quotes:read",
    "quotes:write",
    "bookings:read",
    "bookings:write",
    "tasks:read",
    "tasks:write",
    "discussions:read",
    "discussions:write",
    "reports:read",
    "settings:read",
    "settings:write",
    "team:read",
    "team:write"
  ],
  manager: [
    "leads:read",
    "leads:write",
    "events:read",
    "events:write",
    "quotes:read",
    "quotes:write",
    "bookings:read",
    "bookings:write",
    "tasks:read",
    "tasks:write",
    "discussions:read",
    "discussions:write",
    "reports:read",
    "settings:read"
  ],
  sales: [
    "leads:read",
    "leads:write",
    "quotes:read",
    "quotes:write",
    "discussions:read",
    "discussions:write",
    "tasks:read",
    "tasks:write"
  ],
  ops: [
    "events:read",
    "events:write",
    "tasks:read",
    "tasks:write",
    "bookings:read",
    "discussions:read"
  ],
  viewer: [
    "leads:read",
    "events:read",
    "quotes:read",
    "bookings:read",
    "tasks:read"
  ]
} as const;

export type Permission = (typeof ROLE_PERMISSIONS)["owner"][number];

const ROLE_RANK: Record<TeamRole, number> = {
  owner: 6,
  admin: 5,
  manager: 4,
  sales: 3,
  ops: 3,
  viewer: 1
};

export function roleRank(role: TeamRole): number {
  return ROLE_RANK[role] ?? 0;
}

export function hasPermission(role: TeamRole, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS] as readonly string[] | undefined;
  return perms?.includes(permission) ?? false;
}

export function requirePermission(role: TeamRole, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw Object.assign(new Error(`Insufficient permissions: ${permission}`), { status: 403 });
  }
}

export function canAssignRole(assignerRole: TeamRole, targetRole: TeamRole): boolean {
  if (targetRole === "owner") return false;
  if (assignerRole === "owner") return true;
  if (assignerRole === "viewer") return false;
  return roleRank(targetRole) <= roleRank(assignerRole);
}

/** Pass if the role has at least one of the listed permissions. */
export function requireAnyPermission(role: TeamRole, permissions: Permission[]): void {
  if (permissions.some((p) => hasPermission(role, p))) return;
  throw Object.assign(new Error("Insufficient permissions"), { status: 403 });
}
