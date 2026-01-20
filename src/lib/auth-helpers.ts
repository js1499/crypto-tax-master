import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth-config";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { headers } from "next/headers";

const prisma = new PrismaClient();

/**
 * Get the current authenticated user from NextAuth session
 * Use this in API routes and server components
 * @param request - Optional NextRequest object (required for API routes in App Router)
 */
export async function getCurrentUser(request?: NextRequest) {
  try {
    // Validate NEXTAUTH_SECRET is set
    if (!process.env.NEXTAUTH_SECRET) {
      console.error("[Auth Helpers] CRITICAL: NEXTAUTH_SECRET environment variable is not set!");
      console.error("[Auth Helpers] Without NEXTAUTH_SECRET, JWT session validation will fail.");
      console.error("[Auth Helpers] Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"");
      return null;
    }

    // In Next.js 13+ App Router, getServerSession should automatically access cookies
    // However, in some deployments (especially Vercel), manual cookie extraction is more reliable
    let session;

    if (request) {
      // For API routes in App Router
      // Try the simple approach first (recommended by NextAuth)
      try {
        session = await getServerSession(authOptions);

        // If session is null, log cookie info for debugging
        if (!session) {
          const cookieHeader = request.headers.get("cookie");
          const hasAuthCookie = cookieHeader?.includes("next-auth.session-token") ||
                               cookieHeader?.includes("__Secure-next-auth.session-token");

          if (process.env.NODE_ENV === "development") {
            console.log("[Auth Helpers] No session found via getServerSession");
            console.log("[Auth Helpers] Cookie header present:", !!cookieHeader);
            console.log("[Auth Helpers] Has auth cookie:", hasAuthCookie);
            if (cookieHeader) {
              const cookies = cookieHeader.split(';').map(c => c.trim().split('=')[0]);
              console.log("[Auth Helpers] Available cookies:", cookies);
            }
          }
        }
      } catch (simpleError) {
        // If simple approach fails, try fallback with manual cookie extraction
        if (process.env.NODE_ENV === "development") {
          console.warn("[Auth Helpers] Simple getServerSession failed, trying manual cookie extraction:", simpleError);
        }

        // Fallback: manually extract cookies and create request-like object
        const cookieHeader = request.headers.get("cookie");
        if (cookieHeader) {
          // Create a more complete request mock that NextAuth expects
          const mockReq = {
            headers: {
              cookie: cookieHeader,
              get: (name: string) => {
                if (name.toLowerCase() === 'cookie') return cookieHeader;
                return request.headers.get(name);
              },
            },
            cookies: parseCookies(cookieHeader),
          } as any;

          session = await getServerSession(authOptions);
        }
      }
    } else {
      // For server components, use headers from next/headers
      try {
        session = await getServerSession(authOptions);
      } catch (e) {
        if (process.env.NODE_ENV === "development") {
          console.error("[Auth Helpers] Error in server component getServerSession:", e);
        }
        return null;
      }
    }

    if (!session?.user?.email) {
      if (process.env.NODE_ENV === "development" && request) {
        console.log("[Auth Helpers] No session user email found");
      }
      return null;
    }

    // Look up user in database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!user) {
      console.warn(`[Auth Helpers] Session exists for ${session.user.email} but user not found in database`);
      return null;
    }

    if (process.env.NODE_ENV === "development") {
      console.log(`[Auth Helpers] User authenticated: ${user.email} (ID: ${user.id})`);
    }

    return user;
  } catch (error) {
    // Always log auth errors with details
    console.error("[Auth Helpers] Error getting current user:", error);

    // Re-throw database connection errors so they can be handled by the caller
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    if (errorMessage.includes("Can't reach database") || errorMessage.includes("P1001")) {
      throw error; // Re-throw database connection errors
    }
    return null;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Helper function to parse cookie header into an object
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    if (name && rest.length > 0) {
      cookies[name] = rest.join('=');
    }
  });
  return cookies;
}

/**
 * Require authentication - throws error if not authenticated
 * Use this in API routes that require authentication
 */
export async function requireAuth() {
  const user = await getCurrentUser();
  
  if (!user) {
    throw new Error("Not authenticated");
  }
  
  return user;
}
