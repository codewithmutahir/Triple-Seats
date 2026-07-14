import type { Response } from "express";

import { SessionError } from "./session";

export function handleRouteError(res: Response, e: unknown, label = "Route") {
  if (e instanceof SessionError) {
    return res.status(e.status).json({ error: e.message });
  }
  const status =
    e && typeof e === "object" && "status" in e ? Number((e as { status: number }).status) : 500;
  if (status === 403) {
    return res.status(403).json({ error: (e as Error).message || "Forbidden" });
  }
  if (Number.isFinite(status) && status >= 400 && status < 500) {
    return res.status(status).json({
      error: e instanceof Error && e.message ? e.message : "Bad request"
    });
  }
  if (Number.isFinite(status) && status >= 500 && status < 600 && status !== 500) {
    return res.status(status).json({
      error: e instanceof Error && e.message ? e.message : "Upstream error"
    });
  }
  if (process.env.NODE_ENV !== "production") {
    console.error(`${label} error:`, e);
  } else {
    console.error(`${label} error`);
  }
  return res.status(500).json({ error: "Internal server error" });
}
