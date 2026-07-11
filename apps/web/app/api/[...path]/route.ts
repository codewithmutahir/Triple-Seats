import { cookies, headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const apiOrigin = () =>
  (process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4000").replace(/\/+$/, "");

/** Drop stale Domain= on auth cookies when API env still points at an old host. */
function rewriteSetCookieForProxy(setCookie: string, requestHost: string | null): string {
  const hostname = requestHost?.split(":")[0]?.toLowerCase();
  if (!hostname) return setCookie;

  const parts = setCookie.split(";").map((p) => p.trim());
  const domainPart = parts.find((p) => p.toLowerCase().startsWith("domain="));
  if (!domainPart) return setCookie;

  const domain = domainPart.slice(7).trim().replace(/^\./, "").toLowerCase();
  if (hostname === domain || hostname.endsWith(`.${domain}`)) {
    return setCookie;
  }

  return parts.filter((p) => !p.toLowerCase().startsWith("domain=")).join("; ");
}

function buildCookieHeader(): string | undefined {
  const fromHeaders = headers().get("cookie")?.trim();
  if (fromHeaders) return fromHeaders;
  const built = cookies()
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  return built || undefined;
}

async function proxyRequest(req: NextRequest, pathSegments: string[]) {
  const path = pathSegments.join("/");
  const target = `${apiOrigin()}/api/${path}${req.nextUrl.search}`;
  const isLongRunning =
    path.endsWith("/pdf") ||
    path.endsWith("/send") ||
    path.endsWith("/kitchen-sheet") ||
    path.includes("/pdf/");

  const forwardHeaders = new Headers();
  const accept = req.headers.get("accept");
  if (accept) forwardHeaders.set("accept", accept);
  const contentType = req.headers.get("content-type");
  if (contentType) forwardHeaders.set("content-type", contentType);
  const origin = req.headers.get("origin");
  if (origin) forwardHeaders.set("origin", origin);
  const referer = req.headers.get("referer");
  if (referer) forwardHeaders.set("referer", referer);
  const host = req.headers.get("host");
  if (host) {
    forwardHeaders.set("x-forwarded-host", host);
    forwardHeaders.set("host", host);
  }
  forwardHeaders.set("x-forwarded-proto", req.nextUrl.protocol.replace(":", ""));
  const cookieHeader = buildCookieHeader();
  if (cookieHeader) forwardHeaders.set("cookie", cookieHeader);

  const init: RequestInit = {
    method: req.method,
    headers: forwardHeaders,
    cache: "no-store",
    redirect: "manual"
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      init.body = await req.arrayBuffer();
    } catch (err) {
      console.error("Failed to read request body:", err);
      return NextResponse.json(
        { error: "Something was wrong with your request. Please check your input and try again." },
        { status: 400 }
      );
    }
  }

  const timeoutMs = isLongRunning ? 120_000 : 30_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  init.signal = controller.signal;

  let res;
  try {
    res = await fetch(target, init);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json(
        { error: isLongRunning ? "Request timed out while generating the quote PDF." : "Gateway timeout" },
        { status: 504 }
      );
    }
    console.error("Proxy fetch failed:", err);
    return NextResponse.json(
      { error: "We couldn't reach the server. Please try again." },
      { status: 502 }
    );
  }
  clearTimeout(timeoutId);

  const responseHeaders = new Headers();
  const requestHost = req.headers.get("host");
  const isAuthPath = path.startsWith("auth/");

  for (const cookie of res.headers.getSetCookie()) {
    const value = isAuthPath ? rewriteSetCookieForProxy(cookie, requestHost) : cookie;
    responseHeaders.append("set-cookie", value);
  }

  const contentTypeRes = res.headers.get("content-type");
  if (contentTypeRes) responseHeaders.set("content-type", contentTypeRes);

  const disposition = res.headers.get("content-disposition");
  if (disposition) responseHeaders.set("content-disposition", disposition);

  const contentLength = res.headers.get("content-length");
  if (contentLength) responseHeaders.set("content-length", contentLength);

  return new NextResponse(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders
  });
}

type RouteContext = { params: { path: string[] } };

async function handle(req: NextRequest, ctx: RouteContext) {
  return proxyRequest(req, ctx.params.path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
