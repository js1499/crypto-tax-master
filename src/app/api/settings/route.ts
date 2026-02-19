import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";

const VALID_METHODS = ["FIFO", "LIFO", "HIFO"] as const;

/**
 * GET /api/settings
 * Returns the user's settings (costBasisMethod)
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = rateLimitAPI(request, 100);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { costBasisMethod: true },
    });

    if (!dbUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: "success",
      costBasisMethod: dbUser.costBasisMethod,
    });
  } catch (error) {
    console.error("[Settings API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settings
 * Updates the user's settings (costBasisMethod)
 */
export async function PUT(request: NextRequest) {
  try {
    const rateLimitResult = rateLimitAPI(request, 30);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { costBasisMethod } = body;

    if (!costBasisMethod || !VALID_METHODS.includes(costBasisMethod)) {
      return NextResponse.json(
        { error: "Invalid costBasisMethod. Must be FIFO, LIFO, or HIFO." },
        { status: 400 }
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { costBasisMethod },
      select: { costBasisMethod: true },
    });

    return NextResponse.json({
      status: "success",
      costBasisMethod: updatedUser.costBasisMethod,
    });
  } catch (error) {
    console.error("[Settings API] PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
