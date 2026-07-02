import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getAppOrigin, getTenantSlugFromHost } from "@/lib/tenant-host";

function hasBetterAuthSessionCookie(request: NextRequest): boolean {
  const prefix = "better-auth.session_token";
  const securePrefix = "__Secure-better-auth.session_token";
  return request.cookies.getAll().some(({ name }) => {
    if (name === prefix || name === securePrefix) return true;
    if (name.startsWith(`${prefix}.`) || name.startsWith(`${securePrefix}.`)) return true;
    return false;
  });
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const host = request.headers.get("host") ?? "";
  const tenantSlug = getTenantSlugFromHost(host);
  const session = hasBetterAuthSessionCookie(request);

  // Legacy subdomain links → path-based booking on the app host
  if (tenantSlug && (pathname === "/" || pathname === "/book")) {
    const appOrigin = getAppOrigin();
    if (appOrigin) {
      return NextResponse.redirect(new URL(`/book/${tenantSlug}`, appOrigin));
    }
  }

  if (pathname.startsWith("/dashboard") && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/book", "/book/:path*", "/dashboard/:path*", "/login", "/register"]
};
