import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth-config";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";

const prisma = new PrismaClient();

/**
 * Get the current authenticated user from NextAuth session
 * Use this in API routes and server components
 * @param request - Optional NextRequest object (not used, kept for API compatibility)
 */
export async function getCurrentUser(request?: NextRequest) {
  try {
    // In Next.js 13+ App Router, getServerSession automatically accesses
    // the request context, so we don't need to pass request manually
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    return user;
  } catch (error) {
    // Only log in development
    if (process.env.NODE_ENV === "development") {
      console.error("[Auth Helpers] Error getting current user:", error);
    }
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
