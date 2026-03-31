import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";

const VALID_METHODS = ["FIFO", "LIFO", "HIFO"] as const;
const VALID_COUNTRIES = ["US", "UK", "DE"] as const;

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
      select: { costBasisMethod: true, timezone: true, country: true },
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
      timezone: dbUser.timezone,
      country: dbUser.country,
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
    const { costBasisMethod, timezone, country } = body;

    const updateData: Record<string, string> = {};

    if (costBasisMethod) {
      if (!VALID_METHODS.includes(costBasisMethod)) {
        return NextResponse.json(
          { error: "Invalid costBasisMethod. Must be FIFO, LIFO, or HIFO." },
          { status: 400 }
        );
      }
      updateData.costBasisMethod = costBasisMethod;
    }

    if (timezone) {
      // Validate timezone string
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone });
        updateData.timezone = timezone;
      } catch {
        return NextResponse.json(
          { error: "Invalid timezone. Use IANA format (e.g., America/New_York)." },
          { status: 400 }
        );
      }
    }

    if (country) {
      if (!VALID_COUNTRIES.includes(country)) {
        return NextResponse.json(
          { error: "Invalid country. Must be US, UK, or DE." },
          { status: 400 }
        );
      }
      updateData.country = country;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update." },
        { status: 400 }
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: { costBasisMethod: true, timezone: true, country: true },
    });

    return NextResponse.json({
      status: "success",
      costBasisMethod: updatedUser.costBasisMethod,
      timezone: updatedUser.timezone,
      country: updatedUser.country,
    });
  } catch (error) {
    console.error("[Settings API] PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
