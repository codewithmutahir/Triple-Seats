import type { TeamRole } from "@/lib/permissions";

/** Human-readable role labels for UI (sidebar, badges, staff lists). */
export const ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  sales: "Sales",
  ops: "Operations",
  viewer: "View Only",
  calendar_only: "Vendor Calendar"
};

export const ADMIN_ROLES: TeamRole[] = ["admin"];

export const EMPLOYEE_ROLES: TeamRole[] = ["manager", "sales", "ops", "viewer"];

export function roleLabel(role: TeamRole | string): string {
  return ROLE_LABELS[role as TeamRole] ?? role;
}

export function isAdminRole(role: TeamRole | string): boolean {
  return role === "admin";
}

export function isEmployeeRole(role: TeamRole | string): boolean {
  return EMPLOYEE_ROLES.includes(role as TeamRole);
}

export const EMPLOYEE_ROLE_OPTIONS: {
  value: TeamRole;
  label: string;
  description: string;
}[] = [
  { value: "manager", label: "Manager", description: "Leads, events, quotes, bookings" },
  { value: "sales", label: "Sales", description: "Leads and quotes only" },
  { value: "ops", label: "Operations", description: "Events and tasks only" },
  { value: "viewer", label: "View Only", description: "Read-only access" }
];
