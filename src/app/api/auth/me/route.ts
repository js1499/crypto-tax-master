import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";

/**
 * GET /api/auth/me
 * Get the current authenticated user
 * Uses NextAuth session (consistent with rest of application)
 */
export async function GET(request: NextRequest) {
  try {
    // Use NextAuth's getCurrentUser with request for proper Vercel session handling
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error("[Auth Me API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to get user",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
