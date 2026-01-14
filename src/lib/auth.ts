import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Create a session for a user
 */
export function createSession(userId: string): string {
  // Generate a simple session token (in production, use JWT or a more secure method)
  const sessionToken = `${userId}-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  return Buffer.from(sessionToken).toString("base64");
}

/**
 * Get the current user from session cookie value
 * @param sessionCookieValue - The value of the session_token cookie
 */
export async function getCurrentUser(sessionCookieValue?: string): Promise<{
  id: string;
  email: string;
  name: string | null;
} | null> {
  try {
    // If no cookie value provided, try to get from cookies() (for server components)
    let sessionCookie = sessionCookieValue;
    
    if (!sessionCookie) {
      try {
        const { cookies } = await import("next/headers");
        const cookieStore = await cookies();
        sessionCookie = cookieStore.get("session_token")?.value;
      } catch (e) {
        // If cookies() fails (e.g., in API routes), return null
        return null;
      }
    }

    if (!sessionCookie) {
      return null;
    }

    // Decode session token
    const sessionData = Buffer.from(sessionCookie, "base64").toString();
    const userId = sessionData.split("-")[0];

    if (!userId) {
      return null;
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    return user;
  } catch (error) {
    console.error("[Auth] Error getting current user:", error);
    return null;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Get user from email (for API routes that need user lookup)
 */
export async function getUserByEmail(email: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });
    return user;
  } catch (error) {
    console.error("[Auth] Error getting user by email:", error);
    return null;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
export function isValidPassword(password: string): {
  valid: boolean;
  message?: string;
} {
  if (password.length < 8) {
    return {
      valid: false,
      message: "Password must be at least 8 characters long",
    };
  }

  if (!/[A-Z]/.test(password)) {
    return {
      valid: false,
      message: "Password must contain at least one uppercase letter",
    };
  }

  if (!/[a-z]/.test(password)) {
    return {
      valid: false,
      message: "Password must contain at least one lowercase letter",
    };
  }

  if (!/[0-9]/.test(password)) {
    return {
      valid: false,
      message: "Password must contain at least one number",
    };
  }

  return { valid: true };
}
