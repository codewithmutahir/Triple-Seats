import type { Request, Response } from "express";
import { Router } from "express";

import { prisma } from "@tripeseats/database";

import {
  buildCloverAuthorizeUrl,
  cloverOAuthConfigured,
  cloverOAuthRedirectUri,
  createOAuthState,
  exchangeCloverOAuthCode,
  parseOAuthState
} from "../lib/clover-oauth";
import { handleRouteError } from "../lib/route-errors";
import { encryptSecret } from "../lib/secret-crypto";
import { getAuthorizedSession } from "../lib/authorized-session";

const router = Router();

function settingsRedirect(query: Record<string, string>): string {
  const redirect = cloverOAuthRedirectUri();
  const origin =
    redirect.replace(/\/api\/clover\/oauth\/callback\/?$/i, "") ||
    process.env.WEB_ORIGIN?.trim().replace(/\/+$/, "") ||
    process.env.BETTER_AUTH_URL?.trim().replace(/\/+$/, "") ||
    "http://localhost:3000";
  const url = new URL("/dashboard/settings", origin);
  url.searchParams.set("tab", "payments");
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

/** Start OAuth from Tripleseats Settings → Connect Clover. */
router.get("/oauth/start", async (req: Request, res: Response) => {
  try {
    const { caterer } = await getAuthorizedSession(req, "settings:write");
    if (!cloverOAuthConfigured()) {
      return res.status(503).json({
        error: "Clover OAuth is not configured. Set CLOVER_APP_ID and CLOVER_APP_SECRET."
      });
    }
    const state = createOAuthState(caterer.id);
    const authorizeUrl = buildCloverAuthorizeUrl({ state });
    return res.redirect(302, authorizeUrl);
  } catch (e) {
    return handleRouteError(res, e, "CloverOAuthStart");
  }
});

/**
 * OAuth callback / App Market alternate launch path.
 * - With `code` (+ state): exchange tokens and save.
 * - With `merchant_id` only: kick off authorize for that merchant.
 */
router.get("/oauth/callback", async (req: Request, res: Response) => {
  try {
    if (!cloverOAuthConfigured()) {
      return res.redirect(302, settingsRedirect({ clover: "oauth_not_configured" }));
    }

    const code = typeof req.query.code === "string" ? req.query.code.trim() : "";
    const merchantIdRaw =
      typeof req.query.merchant_id === "string" ? req.query.merchant_id.trim() : "";
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
        settingsRedirect({ clover: "oauth_denied", reason: error.slice(0, 80) })
      );
    }

    // App Market launch: merchant lands here without code — start authorize.
    if (!code && merchantIdRaw) {
      let catererId: string | null = null;
      const fromState = parseOAuthState(stateRaw);
      if (fromState) {
        catererId = fromState.catererId;
      } else {
        try {
          const { caterer } = await getAuthorizedSession(req, "settings:write");
          catererId = caterer.id;
        } catch {
          return res.redirect(302, settingsRedirect({ clover: "oauth_login_required" }));
        }
      }
      if (!catererId) {
        return res.redirect(302, settingsRedirect({ clover: "oauth_login_required" }));
      }
      const state = createOAuthState(catererId);
      return res.redirect(302, buildCloverAuthorizeUrl({ state, merchantId: merchantIdRaw }));
    }

    if (!code) {
      return res.redirect(302, settingsRedirect({ clover: "oauth_missing_code" }));
    }

    const parsed = parseOAuthState(stateRaw);
    if (!parsed) {
      return res.redirect(302, settingsRedirect({ clover: "oauth_invalid_state" }));
    }

    const tokens = await exchangeCloverOAuthCode(code);
    const merchantId = merchantIdRaw || null;
    if (!merchantId) {
      return res.redirect(302, settingsRedirect({ clover: "oauth_missing_merchant" }));
    }

    const clash = await prisma.caterer.findFirst({
      where: { cloverMerchantId: merchantId, id: { not: parsed.catererId } },
      select: { id: true }
    });
    if (clash) {
      return res.redirect(302, settingsRedirect({ clover: "oauth_merchant_taken" }));
    }

    const accessEnc = encryptSecret(tokens.accessToken);
    const refreshEnc = encryptSecret(tokens.refreshToken);
    if (!accessEnc || !refreshEnc) {
      return res.redirect(302, settingsRedirect({ clover: "oauth_encrypt_failed" }));
    }

    await prisma.caterer.update({
      where: { id: parsed.catererId },
      data: {
        cloverMerchantId: merchantId,
        cloverPrivateKeyEnc: accessEnc,
        cloverRefreshTokenEnc: refreshEnc,
        cloverAccessTokenExpiresAt: tokens.accessTokenExpiresAt,
        cloverConnectedAt: new Date()
      }
    });

    return res.redirect(302, settingsRedirect({ clover: "connected" }));
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[clover-oauth] callback error:", e);
    }
    return res.redirect(302, settingsRedirect({ clover: "oauth_failed" }));
  }
});

export const cloverOAuthRouter = router;
