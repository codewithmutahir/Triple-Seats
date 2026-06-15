import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

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
  const session = hasBetterAuthSessionCookie(request);
  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");

  if (isDashboard && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Do not redirect /login or /register → /dashboard here from cookie presence alone.
  // Stale or invalid cookies + server session checks would otherwise 307-loop with the dashboard layout.

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"]
};
