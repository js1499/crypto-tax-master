import { getServerSession } from "next-auth/next";
import { getToken } from "next-auth/jwt";
import { authOptions } from "./auth-config";
import prisma from "./prisma";
import type { NextRequest } from "next/server";

/**
 * Get the current authenticated user from NextAuth session
 * Works in both API routes and server components in App Router
 *
 * @param request - Optional NextRequest object from API route handlers
 *                  If provided, uses getToken for reliable JWT extraction on Vercel
 *                  This is required for proper session handling in serverless environments
 */
export async function getCurrentUser(request?: NextRequest) {
  try {
    // BUG-006 fix: Validate NEXTAUTH_SECRET is set - throw in production
    if (!process.env.NEXTAUTH_SECRET) {
      const errorMsg = "NEXTAUTH_SECRET is not configured";
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

      // In production, throw an error to make the issue obvious
      if (process.env.NODE_ENV === "production") {
        throw new Error(errorMsg);
      }
      return null;
    }

    let userEmail: string | null = null;

    try {
      if (request) {
        // For API routes on Vercel: Use getToken which directly decodes JWT from request
        // This is more reliable than getServerSession in serverless environments
        // because it doesn't require a mock req/res object
        const isProduction = process.env.NODE_ENV === "production";
        const token = await getToken({
          req: request,
          secret: process.env.NEXTAUTH_SECRET,
          // In production (HTTPS), NextAuth uses __Secure- prefixed cookies
          // We must explicitly tell getToken to look for secure cookies on Vercel
          secureCookie: isProduction,
          cookieName: isProduction
            ? "__Secure-next-auth.session-token"
            : "next-auth.session-token",
        });

        if (token?.email) {
          userEmail = token.email as string;
          if (process.env.NODE_ENV === "development") {
            console.log(`[Auth] Token found for: ${userEmail}`);
          }
        } else if (process.env.NODE_ENV === "development") {
          console.log("[Auth] No token found in request");
          // Log cookie info for debugging
          const cookieHeader = request.headers.get("cookie") || "";
          const hasSessionToken = cookieHeader.includes("next-auth.session-token") ||
                                  cookieHeader.includes("__Secure-next-auth.session-token");
          console.log(`[Auth] Session token cookie present: ${hasSessionToken}`);
        }
      } else {
        // For server components: getServerSession automatically accesses cookies via Next.js context
        const session = await getServerSession(authOptions);
        if (session?.user?.email) {
          userEmail = session.user.email;
        } else if (process.env.NODE_ENV === "development") {
          console.log("[Auth] No session found - user may not be logged in");
        }
      }
    } catch (sessionError) {
      console.error("[Auth] Error getting session/token:", sessionError);
      const errorMsg = sessionError instanceof Error ? sessionError.message : "Unknown error";
      if (errorMsg.includes("NEXTAUTH_SECRET") || errorMsg.includes("secret")) {
        console.error("[Auth] NEXTAUTH_SECRET might be invalid or missing");
      }
      return null;
    }

    if (!userEmail) {
      if (process.env.NODE_ENV === "development") {
        console.log("[Auth] No user email found in session/token");
      }
      return null;
    }

    // Look up full user record in database
    const user = await prisma.user.findUnique({
      where: { email: userEmail },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!user) {
      console.warn(`[Auth] Session exists for ${userEmail} but user not found in database`);
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
