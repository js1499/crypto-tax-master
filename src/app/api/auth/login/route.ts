import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyPassword, createSession, isValidEmail } from "@/lib/auth";
import { rateLimitAuth, createRateLimitResponse } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/auth/login
 * Login with email and password
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting for auth endpoints (stricter to prevent brute force)
    const rateLimitResult = rateLimitAuth(request, 5); // 5 attempts per 15 minutes
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }
    const body = await request.json();
    const { email, password } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      // Don't reveal if user exists or not (security best practice)
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Check if user has a password (OAuth users won't have one)
    if (!user.passwordHash) {
      return NextResponse.json(
        { error: "This account was created with OAuth. Please use OAuth to login." },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    // Create session
    const sessionToken = createSession(user.id);

    // Set session cookie
    const response = NextResponse.json(
      {
        message: "Login successful",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      },
      { status: 200 }
    );

    response.cookies.set({
      name: "session_token",
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[Login API] Error:", error);
    
    // Capture error in Sentry
    Sentry.captureException(error, {
      tags: {
        endpoint: "/api/auth/login",
      },
    });
    
    return NextResponse.json(
      {
        error: "Failed to login",
        ...(process.env.NODE_ENV === "development" && {
          details: error instanceof Error ? error.message : "Unknown error",
        }),
      },
      { status: 500 }
    );
  }
}
