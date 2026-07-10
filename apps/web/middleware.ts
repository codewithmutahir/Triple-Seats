import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { checkMiddlewareSession } from "@tripeseats/auth";

import { getAppOrigin, getTenantSlugFromHost } from "@/lib/tenant-host";

const PROTECTED_PREFIXES = ["/dashboard", "/invite"] as const;

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function loginRedirect(request: NextRequest, reason?: "session_expired") {
  const url = new URL("/login", request.url);
  if (reason) {
    url.searchParams.set("reason", reason);
  }
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const host = request.headers.get("host") ?? "";
  const tenantSlug = getTenantSlugFromHost(host);
  const sessionCheck = await checkMiddlewareSession(request);

  // Legacy subdomain links → path-based booking on the app host
  if (tenantSlug && (pathname === "/" || pathname === "/book")) {
    const appOrigin = getAppOrigin();
    if (appOrigin) {
      return NextResponse.redirect(new URL(`/book/${tenantSlug}`, appOrigin));
    }
  }

  if (isProtectedPath(pathname)) {
    if (!sessionCheck.hasSessionCookie) {
      return loginRedirect(request);
    }
    if (sessionCheck.isExpired) {
      return loginRedirect(request, "session_expired");
    }
  }

  if ((pathname === "/login" || pathname === "/register") && sessionCheck.hasSessionCookie && !sessionCheck.isExpired) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/book",
    "/book/:path*",
    "/dashboard/:path*",
    "/invite/:path*",
    "/login",
    "/register"
  ]
};
