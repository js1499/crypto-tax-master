import { getServerSession } from "next-auth";
import { authOptions } from "./auth-config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Get the current authenticated user from NextAuth session
 * Use this in API routes and server components
 */
export async function getCurrentUser() {
  try {
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
