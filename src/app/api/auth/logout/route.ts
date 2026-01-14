import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/auth/logout
 * Logout the current user by clearing session cookie
 */
export async function POST(request: NextRequest) {
  try {
    const response = NextResponse.json(
      { message: "Logged out successfully" },
      { status: 200 }
    );

    // Clear session cookie
    response.cookies.set({
      name: "session_token",
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: new Date(0),
      path: "/",
    });

    // Also clear Coinbase tokens if they exist
    response.cookies.set({
      name: "coinbase_tokens",
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      expires: new Date(0),
      path: "/",
    });

    response.cookies.set({
      name: "coinbase_connection",
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      expires: new Date(0),
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[Logout API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to logout",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
