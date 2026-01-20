import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth-config";
import { PrismaClient } from "@prisma/client";
import type { NextRequest } from "next/server";

const prisma = new PrismaClient();

/**
 * Get the current authenticated user from NextAuth session
 * Works in both API routes and server components in App Router
 *
 * @param request - Optional NextRequest object from API route handlers
 *                  If provided, cookies will be extracted from request headers
 *                  This is required for proper session handling on Vercel
 */
export async function getCurrentUser(request?: NextRequest) {
  try {
    // Critical: Validate NEXTAUTH_SECRET is set
    if (!process.env.NEXTAUTH_SECRET) {
      console.error("=" + "=".repeat(70));
      console.error("CRITICAL ERROR: NEXTAUTH_SECRET is not set!");
      console.error("=" + "=".repeat(70));
      console.error("Without NEXTAUTH_SECRET, JWT session validation will ALWAYS fail.");
      console.error("");
      console.error("To fix this:");
      console.error("1. Open your .env file");
      console.error("2. Make sure this line exists:");
      console.error("   NEXTAUTH_SECRET=your-secret-here");
      console.error("");
      console.error("Generate a new secret with:");
      console.error('   node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
      console.error("=" + "=".repeat(70));
      return null;
    }

    // Get session from NextAuth
    // In App Router API routes on Vercel, we need to explicitly pass request headers
    let session;
    try {
      if (request) {
        // For API routes: Extract cookies from request and create request-like object
        // NextAuth's getServerSession needs req and res objects for API routes
        const cookieHeader = request.headers.get("cookie") || "";
        const req = {
          headers: {
            cookie: cookieHeader,
            "user-agent": request.headers.get("user-agent") || "",
            "x-forwarded-for": request.headers.get("x-forwarded-for") || "",
            "x-forwarded-host": request.headers.get("x-forwarded-host") || "",
            "x-forwarded-proto": request.headers.get("x-forwarded-proto") || "https",
          },
        } as any;
        const res = {
          setHeader: () => {},
          getHeader: () => {},
        } as any;
        // getServerSession(req, res, authOptions) for API routes
        session = await getServerSession(req, res, authOptions);
      } else {
        // For server components: getServerSession automatically accesses cookies via Next.js context
        session = await getServerSession(authOptions);
      }
    } catch (sessionError) {
      console.error("[Auth] Error getting session:", sessionError);
      const errorMsg = sessionError instanceof Error ? sessionError.message : "Unknown error";
      if (errorMsg.includes("NEXTAUTH_SECRET") || errorMsg.includes("secret")) {
        console.error("[Auth] NEXTAUTH_SECRET might be invalid or missing");
      }
      return null;
    }

    if (!session) {
      if (process.env.NODE_ENV === "development") {
        console.log("[Auth] No session found - user may not be logged in");
        console.log("[Auth] Check browser cookies for 'next-auth.session-token'");
      }
      return null;
    }

    if (!session.user?.email) {
      if (process.env.NODE_ENV === "development") {
        console.log("[Auth] Session exists but no user email");
      }
      return null;
    }

    // Look up full user record in database
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!user) {
      console.warn(`[Auth] Session exists for ${session.user.email} but user not found in database`);
      return null;
    }

    if (process.env.NODE_ENV === "development") {
      console.log(`[Auth] ✓ User authenticated: ${user.email}`);
    }

    return user;
  } catch (error) {
    console.error("[Auth] Error in getCurrentUser:", error);

    // Re-throw database connection errors
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    if (errorMessage.includes("Can't reach database") || errorMessage.includes("P1001")) {
      throw error;
    }

    return null;
  } finally {
    await prisma.$disconnect();
  }
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
