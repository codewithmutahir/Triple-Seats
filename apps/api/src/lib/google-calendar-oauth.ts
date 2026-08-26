import { createHmac, timingSafeEqual } from "node:crypto";

import { encryptSecret } from "./secret-crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email"
];

export type GoogleOAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
};

function publicAppOrigin(): string {
  return (
    process.env.WEB_ORIGIN?.trim().replace(/\/+$/, "") ||
    process.env.BETTER_AUTH_URL?.trim().replace(/\/+$/, "") ||
    "http://localhost:3000"
  );
}

export function googleCalendarOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim()
  );
}

export function googleCalendarOAuthRedirectUri(): string {
  const explicit = process.env.GOOGLE_CALENDAR_OAUTH_REDIRECT_URI?.trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  return `${publicAppOrigin()}/api/vendor-calendar/google/oauth/callback`;
}

function oauthStateSecret(): string {
  return (
    process.env.GOOGLE_CALENDAR_SECRETS_KEY?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    "dev-only-google-calendar-oauth-state"
  );
}

export function createGoogleOAuthState(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      u: userId,
      e: Date.now() + 15 * 60 * 1000,
      n: Math.random().toString(36).slice(2)
    }),
    "utf8"
  ).toString("base64url");
  const sig = createHmac("sha256", oauthStateSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function parseGoogleOAuthState(state: string | undefined): { userId: string } | null {
  if (!state || !state.includes(".")) return null;
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", oauthStateSecret()).update(payload).digest("base64url");
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(sig, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      u?: string;
      e?: number;
    };
    if (!data.u || typeof data.e !== "number" || Date.now() > data.e) return null;
    return { userId: data.u };
  } catch {
    return null;
  }
}

export function buildGoogleAuthorizeUrl(state: string): string {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  if (!clientId) {
    throw Object.assign(new Error("GOOGLE_CALENDAR_CLIENT_ID is not configured."), { status: 503 });
  }
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", googleCalendarOAuthRedirectUri());
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

async function postGoogleToken(body: URLSearchParams): Promise<Record<string, unknown>> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = {};
  }
  if (!res.ok) {
    const message =
      typeof json.error_description === "string"
        ? json.error_description
        : typeof json.error === "string"
          ? json.error
          : `Google OAuth failed (${res.status})`;
    if (process.env.NODE_ENV !== "production") {
      console.error("[google-calendar-oauth] token", res.status, text.slice(0, 400));
    }
    throw Object.assign(new Error(message), { status: res.status >= 500 ? 502 : 400 });
  }
  return json;
}

function parseGoogleTokens(json: Record<string, unknown>): GoogleOAuthTokens {
  const accessToken = typeof json.access_token === "string" ? json.access_token : "";
  if (!accessToken) {
    throw Object.assign(new Error("Google OAuth response missing access token."), { status: 502 });
  }
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  return {
    accessToken,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
    expiresAt: new Date(Date.now() + expiresIn * 1000)
  };
}

export async function exchangeGoogleOAuthCode(code: string): Promise<GoogleOAuthTokens> {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) {
    throw Object.assign(new Error("Google Calendar OAuth credentials are not configured."), {
      status: 503
    });
  }
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: googleCalendarOAuthRedirectUri(),
    grant_type: "authorization_code"
  });
  const json = await postGoogleToken(body);
  return parseGoogleTokens(json);
}

export async function refreshGoogleOAuthToken(refreshToken: string): Promise<GoogleOAuthTokens> {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) {
    throw Object.assign(new Error("Google Calendar OAuth credentials are not configured."), {
      status: 503
    });
  }
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token"
  });
  const json = await postGoogleToken(body);
  const tokens = parseGoogleTokens(json);
  return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
}

export async function fetchGoogleAccountEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { email?: string };
  return typeof json.email === "string" ? json.email : null;
}

export function encryptGoogleTokens(tokens: GoogleOAuthTokens) {
  return {
    accessEnc: encryptSecret(tokens.accessToken),
    refreshEnc: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
    expiresAt: tokens.expiresAt
  };
}

export function vendorCalendarRedirect(query: Record<string, string>): string {
  const origin = publicAppOrigin();
  const url = new URL("/dashboard/vendor-calendar", origin);
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}
