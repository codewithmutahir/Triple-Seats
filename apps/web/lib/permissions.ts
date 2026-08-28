export type TeamRole = "owner" | "admin" | "manager" | "sales" | "ops" | "viewer" | "calendar_only";

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
    "billing:write",
    "vendor_calendar:read",
    "vendor_calendar:write"
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
    "team:write",
    "vendor_calendar:read",
    "vendor_calendar:write"
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
    "settings:read",
    "vendor_calendar:read",
    "vendor_calendar:write"
  ],
  sales: [
    "leads:read",
    "leads:write",
    "quotes:read",
    "quotes:write",
    "discussions:read",
    "discussions:write",
    "tasks:read",
    "tasks:write",
    "vendor_calendar:read",
    "vendor_calendar:write"
  ],
  ops: [
    "events:read",
    "events:write",
    "tasks:read",
    "tasks:write",
    "bookings:read",
    "discussions:read",
    "vendor_calendar:read",
    "vendor_calendar:write"
  ],
  viewer: [
    "leads:read",
    "events:read",
    "quotes:read",
    "bookings:read",
    "tasks:read",
    "vendor_calendar:read",
    "vendor_calendar:write"
  ],
  calendar_only: ["vendor_calendar:read", "vendor_calendar:write"]
} as const;

export type Permission = (typeof ROLE_PERMISSIONS)["owner"][number];

export function hasPermission(role: TeamRole, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] as readonly string[] | undefined)?.includes(permission) ?? false;
}

/** Viewer has read-only access across the workspace (Option C). */
export function isReadOnlyRole(role: TeamRole): boolean {
  return role === "viewer";
}

/** External vendor — only vendor calendar in the dashboard. */
export function isCalendarOnlyRole(role: TeamRole): boolean {
  return role === "calendar_only";
}

const WRITE_PERMISSION_SUFFIX = ":write" as const;

/** True if role has any write capability (not pure viewer). */
export function roleHasAnyWrite(role: TeamRole): boolean {
  const perms = ROLE_PERMISSIONS[role] as readonly string[];
  return perms.some((p) => p.endsWith(WRITE_PERMISSION_SUFFIX));
}
