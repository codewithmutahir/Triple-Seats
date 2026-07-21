import { createHmac, timingSafeEqual } from "node:crypto";

function publicAppOrigin(): string {
  return (
    process.env.WEB_ORIGIN?.trim().replace(/\/+$/, "") ||
    process.env.BETTER_AUTH_URL?.trim().replace(/\/+$/, "") ||
    "http://localhost:3000"
  );
}

export type CloverOAuthTokenPair = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date | null;
};

function apiBaseUrl(): string {
  return (process.env.CLOVER_API_BASE_URL ?? "https://apisandbox.dev.clover.com").replace(
    /\/+$/,
    ""
  );
}

/** Browser authorize host differs from API host in sandbox. */
export function cloverOAuthAuthorizeBase(): string {
  const api = apiBaseUrl().toLowerCase();
  if (api.includes("sandbox")) return "https://sandbox.dev.clover.com";
  if (api.includes("eu.clover")) return "https://www.eu.clover.com";
  if (api.includes("la.clover")) return "https://www.la.clover.com";
  return "https://www.clover.com";
}

export function cloverOAuthConfigured(): boolean {
  return Boolean(process.env.CLOVER_APP_ID?.trim() && process.env.CLOVER_APP_SECRET?.trim());
}

export function cloverOAuthRedirectUri(): string {
  const explicit = process.env.CLOVER_OAUTH_REDIRECT_URI?.trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  return `${publicAppOrigin()}/api/clover/oauth/callback`;
}

function oauthStateSecret(): string {
  return (
    process.env.CLOVER_SECRETS_KEY?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    "dev-only-clover-oauth-state"
  );
}

export function createOAuthState(catererId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      c: catererId,
      e: Date.now() + 15 * 60 * 1000,
      n: Math.random().toString(36).slice(2)
    }),
    "utf8"
  ).toString("base64url");
  const sig = createHmac("sha256", oauthStateSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function parseOAuthState(state: string | undefined): { catererId: string } | null {
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
      c?: string;
      e?: number;
    };
    if (!data.c || typeof data.e !== "number" || Date.now() > data.e) return null;
    return { catererId: data.c };
  } catch {
    return null;
  }
}

export function buildCloverAuthorizeUrl(opts: {
  state: string;
  merchantId?: string;
}): string {
  const clientId = process.env.CLOVER_APP_ID?.trim();
  if (!clientId) {
    throw Object.assign(new Error("CLOVER_APP_ID is not configured."), { status: 503 });
  }
  const url = new URL("/oauth/v2/authorize", cloverOAuthAuthorizeBase());
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", cloverOAuthRedirectUri());
  url.searchParams.set("state", opts.state);
  if (opts.merchantId) {
    url.searchParams.set("merchant_id", opts.merchantId);
  }
  return url.toString();
}

async function postOAuthJson(
  path: string,
  body: Record<string, string>
): Promise<Record<string, unknown>> {
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
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
      typeof json.message === "string"
        ? json.message
        : typeof json.error === "string"
          ? json.error
          : `Clover OAuth failed (${res.status})`;
    if (process.env.NODE_ENV !== "production") {
      console.error("[clover-oauth]", path, res.status, text.slice(0, 400));
    }
    throw Object.assign(new Error(message), { status: res.status >= 500 ? 502 : 400 });
  }
  return json;
}

function parseTokenPair(json: Record<string, unknown>): CloverOAuthTokenPair {
  const accessToken = typeof json.access_token === "string" ? json.access_token : "";
  const refreshToken = typeof json.refresh_token === "string" ? json.refresh_token : "";
  if (!accessToken || !refreshToken) {
    throw Object.assign(new Error("Clover OAuth response missing tokens."), { status: 502 });
  }
  const accessExpSec =
    typeof json.access_token_expiration === "number"
      ? json.access_token_expiration
      : Math.floor(Date.now() / 1000) + 25 * 60;
  const refreshExpSec =
    typeof json.refresh_token_expiration === "number" ? json.refresh_token_expiration : null;

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: new Date(accessExpSec * 1000),
    refreshTokenExpiresAt: refreshExpSec ? new Date(refreshExpSec * 1000) : null
  };
}

export async function exchangeCloverOAuthCode(code: string): Promise<CloverOAuthTokenPair> {
  const clientId = process.env.CLOVER_APP_ID?.trim() ?? "";
  const clientSecret = process.env.CLOVER_APP_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) {
    throw Object.assign(new Error("Clover OAuth app credentials are not configured."), {
      status: 503
    });
  }
  const json = await postOAuthJson("/oauth/v2/token", {
    client_id: clientId,
    client_secret: clientSecret,
    code
  });
  return parseTokenPair(json);
}

export async function refreshCloverOAuthToken(
  refreshToken: string
): Promise<CloverOAuthTokenPair> {
  const clientId = process.env.CLOVER_APP_ID?.trim() ?? "";
  if (!clientId) {
    throw Object.assign(new Error("CLOVER_APP_ID is not configured."), { status: 503 });
  }
  const json = await postOAuthJson("/oauth/v2/refresh", {
    client_id: clientId,
    refresh_token: refreshToken
  });
  return parseTokenPair(json);
}
