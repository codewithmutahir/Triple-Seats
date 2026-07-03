import { parseApiError } from "@/lib/user-facing-error";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, { credentials: "include", cache: "no-store", ...init });
}

export async function apiFetchJson<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  const res = await apiFetch(path, init);
  const body = (await res.json().catch(() => null)) as { error?: string } | T | null;

  if (res.status === 401) {
    return { ok: false, status: 401, message: "You need to sign in again." };
  }
  if (!res.ok) {
    const errBody =
      body && typeof body === "object" && !Array.isArray(body) && "error" in body
        ? (body as { error?: string })
        : null;
    return {
      ok: false,
      status: res.status,
      message: parseApiError(errBody, res.status, res.statusText)
    };
  }

  return { ok: true, data: body as T };
}
