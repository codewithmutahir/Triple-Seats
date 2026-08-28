import type { Request, Response } from "express";

import { prisma } from "@tripeseats/database";

import { auth } from "./auth";
import { magicLinkExpiresMinutes } from "./magic-link-mail";
import { requestToHeaders } from "./session";

function webOrigin(): string {
  return process.env.WEB_ORIGIN?.trim() || process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3000";
}

export async function emailHasAccount(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  const user = await prisma.user.findFirst({
    where: { email: { equals: normalized, mode: "insensitive" } },
    select: { id: true }
  });
  return Boolean(user);
}

function forwardBetterAuthCookies(headers: Headers, res: Response) {
  const cookies =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : headers.get("set-cookie")
        ? [headers.get("set-cookie")!]
        : [];
  if (cookies.length > 0) {
    res.setHeader("Set-Cookie", cookies);
  }
}

type AuthUser = { id: string; email: string; name?: string | null };

export async function authenticateInviteEmail(
  req: Request,
  res: Response,
  opts: { email: string; password: string; name?: string; accountExists: boolean }
): Promise<{ user: AuthUser } | { error: string; status: number }> {
  const headers = requestToHeaders(req);
  const email = opts.email.trim().toLowerCase();

  try {
    if (opts.accountExists) {
      const { headers: authHeaders, response } = await auth.api.signInEmail({
        body: { email, password: opts.password },
        headers,
        returnHeaders: true
      });
      if (!response?.user?.id || !response.user.email) {
        return { error: "Incorrect email or password.", status: 401 };
      }
      forwardBetterAuthCookies(authHeaders, res);
      return { user: response.user };
    }

    const displayName = opts.name?.trim() || email.split("@")[0] || "Vendor";
    const { headers: authHeaders, response } = await auth.api.signUpEmail({
      body: { email, password: opts.password, name: displayName },
      headers,
      returnHeaders: true
    });
    if (!response?.user?.id || !response.user.email) {
      return { error: "Could not create your account. Try again.", status: 400 };
    }
    forwardBetterAuthCookies(authHeaders, res);
    return { user: response.user };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Authentication failed";
    if (/already exists|already registered/i.test(message)) {
      return { error: "An account with this email already exists. Sign in instead.", status: 409 };
    }
    if (/invalid|incorrect|password/i.test(message)) {
      return { error: "Incorrect email or password.", status: 401 };
    }
    return { error: "Could not sign you in. Check your details and try again.", status: 400 };
  }
}

export async function sendInviteMagicLink(
  req: Request,
  opts: { email: string; name?: string | null; inviteToken: string }
): Promise<{ sent: boolean; error?: string }> {
  const email = opts.email.trim().toLowerCase();
  const callbackURL = `${webOrigin()}/invite/${opts.inviteToken}/continue`;
  const errorCallbackURL = `${webOrigin()}/invite/${opts.inviteToken}?magicError=1`;

  try {
    await auth.api.signInMagicLink({
      body: {
        email,
        name: opts.name?.trim() || undefined,
        callbackURL,
        errorCallbackURL,
        metadata: { kind: "vendor_invite", inviteToken: opts.inviteToken }
      },
      headers: requestToHeaders(req)
    });
    return { sent: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not send sign-in link";
    return { sent: false, error: message };
  }
}

export { magicLinkExpiresMinutes };
