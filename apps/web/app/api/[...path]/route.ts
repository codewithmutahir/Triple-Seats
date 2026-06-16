import { cookies, headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const apiOrigin = () =>
  (process.env.INTERNAL_API_URL ?? "http://127.0.0.1:4000").replace(/\/+$/, "");

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

  const forwardHeaders = new Headers();
  const accept = req.headers.get("accept");
  if (accept) forwardHeaders.set("accept", accept);
  const contentType = req.headers.get("content-type");
  if (contentType) forwardHeaders.set("content-type", contentType);
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
      return new NextResponse("Bad request body", { status: 400 });
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
  init.signal = controller.signal;

  let res;
  try {
    res = await fetch(target, init);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      return new NextResponse("Gateway timeout", { status: 504 });
    }
    console.error("Proxy fetch failed:", err);
    return new NextResponse("Bad gateway", { status: 502 });
  }
  clearTimeout(timeoutId);

  const responseHeaders = new Headers();

  for (const cookie of res.headers.getSetCookie()) {
    responseHeaders.append("set-cookie", cookie);
  }

  const contentTypeRes = res.headers.get("content-type");
  if (contentTypeRes) responseHeaders.set("content-type", contentTypeRes);

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
