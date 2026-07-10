import type { Request } from "express";

import { requireAnyPermission, requirePermission, type Permission } from "./permissions";
import { getSession } from "./session";

export async function getAuthorizedSession(req: Request, permission: Permission) {
  const ctx = await getSession(req);
  requirePermission(ctx.role, permission);
  return ctx;
}

export async function getSessionWithAnyPermission(req: Request, permissions: Permission[]) {
  const ctx = await getSession(req);
  requireAnyPermission(ctx.role, permissions);
  return ctx;
}
