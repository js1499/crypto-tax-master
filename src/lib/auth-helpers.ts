import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth-config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Get the current authenticated user from NextAuth session
 * Works in both API routes and server components in App Router
 *
 * In Next.js 13+ App Router, getServerSession automatically accesses cookies
 * from the request context - no need to manually pass request objects
 */
export async function getCurrentUser() {
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
    // In App Router, this automatically accesses cookies from the request context
    const session = await getServerSession(authOptions);

    if (!session) {
      if (process.env.NODE_ENV === "development") {
        console.log("[Auth] No session found");
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
