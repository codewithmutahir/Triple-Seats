import { prisma } from "@tripeseats/database";
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { getAuthorizedSession } from "../lib/authorized-session";
import {
  buildGoogleAuthorizeUrl,
  createGoogleOAuthState,
  encryptGoogleTokens,
  exchangeGoogleOAuthCode,
  googleCalendarOAuthConfigured,
  parseGoogleOAuthState,
  vendorCalendarRedirect,
  fetchGoogleAccountEmail
} from "../lib/google-calendar-oauth";
import { pullGoogleCalendarForUser } from "../lib/google-calendar-sync";
import { handleRouteError } from "../lib/route-errors";

const router = Router();

const syncBodySchema = z.object({
  start: z.string().optional(),
  end: z.string().optional()
});

/** Connection status for the authenticated user. */
router.get("/status", async (req: Request, res: Response) => {
  try {
    const { user } = await getAuthorizedSession(req, "vendor_calendar:read");
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        googleCalendarEmail: true,
        googleCalendarConnectedAt: true,
        googleCalendarId: true,
        googleCalendarRefreshTokenEnc: true
      }
    });
    return res.json({
      configured: googleCalendarOAuthConfigured(),
      connected: Boolean(row?.googleCalendarRefreshTokenEnc),
      email: row?.googleCalendarEmail ?? null,
      calendarId: row?.googleCalendarId ?? "primary",
      connectedAt: row?.googleCalendarConnectedAt?.toISOString() ?? null
    });
  } catch (e) {
    return handleRouteError(res, e, "Google calendar status");
  }
});

/** Start Google OAuth — redirects browser to Google consent. */
router.get("/oauth/start", async (req: Request, res: Response) => {
  try {
    const { user } = await getAuthorizedSession(req, "vendor_calendar:write");
    if (!googleCalendarOAuthConfigured()) {
      return res.status(503).json({
        error: "Google Calendar OAuth is not configured on the server."
      });
    }
    const state = createGoogleOAuthState(user.id);
    return res.redirect(302, buildGoogleAuthorizeUrl(state));
  } catch (e) {
    return handleRouteError(res, e, "Google calendar OAuth start");
  }
});

/** OAuth callback — exchange code and store encrypted tokens. */
router.get("/oauth/callback", async (req: Request, res: Response) => {
  try {
    if (!googleCalendarOAuthConfigured()) {
      return res.redirect(302, vendorCalendarRedirect({ google: "oauth_not_configured" }));
    }

    const code = typeof req.query.code === "string" ? req.query.code.trim() : "";
    const stateRaw = typeof req.query.state === "string" ? req.query.state : undefined;
    const error =
      typeof req.query.error === "string"
        ? req.query.error
        : typeof req.query.error_description === "string"
          ? req.query.error_description
          : "";

    if (error) {
      return res.redirect(
        302,
        vendorCalendarRedirect({ google: "oauth_denied", reason: error.slice(0, 80) })
      );
    }
    if (!code) {
      return res.redirect(302, vendorCalendarRedirect({ google: "oauth_missing_code" }));
    }

    const parsed = parseGoogleOAuthState(stateRaw);
    if (!parsed) {
      return res.redirect(302, vendorCalendarRedirect({ google: "oauth_invalid_state" }));
    }

    const tokens = await exchangeGoogleOAuthCode(code);
    if (!tokens.refreshToken) {
      return res.redirect(302, vendorCalendarRedirect({ google: "oauth_missing_refresh" }));
    }

    const encrypted = encryptGoogleTokens(tokens);
    const email = await fetchGoogleAccountEmail(tokens.accessToken);

    await prisma.user.update({
      where: { id: parsed.userId },
      data: {
        googleCalendarRefreshTokenEnc: encrypted.refreshEnc,
        googleCalendarAccessTokenEnc: encrypted.accessEnc,
        googleCalendarTokenExpiresAt: encrypted.expiresAt,
        googleCalendarEmail: email,
        googleCalendarConnectedAt: new Date(),
        googleCalendarId: "primary"
      }
    });

    return res.redirect(302, vendorCalendarRedirect({ google: "connected" }));
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[google-calendar-oauth] callback", e);
    }
    return res.redirect(302, vendorCalendarRedirect({ google: "oauth_failed" }));
  }
});

/** Disconnect Google Calendar sync. */
router.post("/disconnect", async (req: Request, res: Response) => {
  try {
    const { user } = await getAuthorizedSession(req, "vendor_calendar:write");
    await prisma.user.update({
      where: { id: user.id },
      data: {
        googleCalendarRefreshTokenEnc: null,
        googleCalendarAccessTokenEnc: null,
        googleCalendarTokenExpiresAt: null,
        googleCalendarEmail: null,
        googleCalendarConnectedAt: null
      }
    });
    return res.json({ ok: true });
  } catch (e) {
    return handleRouteError(res, e, "Google calendar disconnect");
  }
});

/** Pull events from Google into vendor calendar (two-way sync — import leg). */
router.post("/sync", async (req: Request, res: Response) => {
  try {
    const { user, caterer } = await getAuthorizedSession(req, "vendor_calendar:write");
    const parsed = syncBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid input" });
    }

    const start = parsed.data.start ? new Date(parsed.data.start) : new Date();
    const end = parsed.data.end
      ? new Date(parsed.data.end)
      : new Date(start.getTime() + 93 * 24 * 60 * 60 * 1000);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return res.status(400).json({ error: "Invalid date range" });
    }

    const result = await pullGoogleCalendarForUser(user.id, caterer.id, start, end);
    if (!result.ok) {
      return res.status(result.reason === "not_connected" ? 400 : 502).json({
        error:
          result.reason === "not_connected"
            ? "Google Calendar is not connected"
            : "Google sync failed"
      });
    }

    return res.json(result);
  } catch (e) {
    return handleRouteError(res, e, "Google calendar sync");
  }
});

export { router as vendorCalendarGoogleRouter };
