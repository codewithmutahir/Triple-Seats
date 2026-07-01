import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getTenantSlugFromHost, TENANT_HEADER } from "@/lib/tenant-host";

function hasBetterAuthSessionCookie(request: NextRequest): boolean {
  const prefix = "better-auth.session_token";
  const securePrefix = "__Secure-better-auth.session_token";
  return request.cookies.getAll().some(({ name }) => {
    if (name === prefix || name === securePrefix) return true;
    if (name.startsWith(`${prefix}.`) || name.startsWith(`${securePrefix}.`)) return true;
    return false;
  });
}

function withTenantHeader(request: NextRequest, tenantSlug: string | null) {
  const requestHeaders = new Headers(request.headers);
  if (tenantSlug) {
    requestHeaders.set(TENANT_HEADER, tenantSlug);
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const host = request.headers.get("host") ?? "";
  const tenantSlug = getTenantSlugFromHost(host);
  const session = hasBetterAuthSessionCookie(request);

  // Tenant subdomain root → public booking form
  if (tenantSlug && pathname === "/") {
    return NextResponse.redirect(new URL("/book", request.url));
  }

  // Booking form only on tenant subdomains (royaltaj.caterpro.com/book)
  if (!tenantSlug && pathname === "/book") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (pathname.startsWith("/dashboard") && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return withTenantHeader(request, tenantSlug);
}

export const config = {
  matcher: ["/", "/book", "/dashboard/:path*", "/login", "/register"]
};
