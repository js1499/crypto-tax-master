import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check for session token
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Not authenticated → redirect to login (unless already on login/register)
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user hitting root → redirect to accounts
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/accounts", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Only run middleware on protected pages — NOT on login, register, API, or static assets
  matcher: [
    "/",
    "/accounts/:path*",
    "/transactions/:path*",
    "/tax-reports/:path*",
    "/tax-ai/:path*",
    "/tutorial/:path*",
    "/settings/:path*",
    "/securities/:path*",
  ],
};
