export type TeamRole = "owner" | "admin" | "manager" | "sales" | "ops" | "viewer";

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
  ops: ["events:read", "events:write", "tasks:read", "tasks:write", "bookings:read", "discussions:read"],
  viewer: ["leads:read", "events:read", "quotes:read", "bookings:read", "tasks:read"]
} as const;

export type Permission = (typeof ROLE_PERMISSIONS)["owner"][number];

export function hasPermission(role: TeamRole, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] as readonly string[] | undefined)?.includes(permission) ?? false;
}
