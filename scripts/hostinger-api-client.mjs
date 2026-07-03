import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = "https://developers.hostinger.com";

function credentialsPath() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || os.homedir(), "hostinger-mcp", "credentials.json");
  }
  return path.join(os.homedir(), ".config", "hostinger-mcp", "credentials.json");
}

export function loadCredentials() {
  const raw = fs.readFileSync(credentialsPath(), "utf8");
  return JSON.parse(raw);
}

export async function getAccessToken() {
  const apiToken = process.env.HOSTINGER_API_TOKEN?.trim() || process.env.API_TOKEN?.trim();
  if (apiToken) return apiToken;

  const creds = loadCredentials();
  if (creds.access_token && (!creds.expires_at || Date.now() < creds.expires_at - 60_000)) {
    return creds.access_token;
  }
  if (!creds.refresh_token || !creds.client_id) {
    throw new Error("OAuth session expired — run hostinger-hosting-mcp --login again.");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: creds.refresh_token,
    client_id: creds.client_id
  });
  if (creds.client_secret) body.set("client_secret", creds.client_secret);

  const res = await fetch("https://auth.hostinger.com/api/external/v1/oauth-server/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`);
  }

  const next = await res.json();
  const merged = {
    ...creds,
    access_token: next.access_token,
    refresh_token: next.refresh_token ?? creds.refresh_token,
    expires_at: next.expires_in ? Date.now() + next.expires_in * 1000 : creds.expires_at
  };
  fs.writeFileSync(credentialsPath(), JSON.stringify(merged, null, 2));
  return merged.access_token;
}

export async function hostingerFetch(pathname, init = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init.headers ?? {})
    }
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`Hostinger API ${pathname} failed (${res.status}): ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data;
}
