import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";

const VALID_TAX_STATUSES = ["INVESTOR", "TRADER_NO_MTM", "TRADER_MTM"] as const;
const VALID_METHODS = ["METHOD_1", "METHOD_2"] as const;

/**
 * GET /api/securities/settings
 * Returns the user's securities tax settings for a given year.
 * Query params: year (default: current year)
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

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));

    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "Invalid year." },
        { status: 400 }
      );
    }

    const settings = await prisma.securitiesTaxSettings.findUnique({
      where: {
        userId_year: { userId: user.id, year },
      },
    });

    return NextResponse.json({
      status: "success",
      settings: settings || {
        userId: user.id,
        year,
        taxStatus: "INVESTOR",
        section988Election: false,
        substantiallyIdenticalMethod: "METHOD_1",
      },
    });
  } catch (error) {
    console.error("[Securities Settings API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch securities settings" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/securities/settings
 * Upserts the user's securities tax settings for a given year.
 * Body: { year, taxStatus?, section988Election?, substantiallyIdenticalMethod? }
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
    const { year, taxStatus, section988Election, substantiallyIdenticalMethod } = body;

    if (!year || isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "Invalid or missing year." },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (taxStatus !== undefined) {
      if (!VALID_TAX_STATUSES.includes(taxStatus)) {
        return NextResponse.json(
          { error: "Invalid taxStatus. Must be INVESTOR, TRADER_NO_MTM, or TRADER_MTM." },
          { status: 400 }
        );
      }
      updateData.taxStatus = taxStatus;
    }

    if (section988Election !== undefined) {
      updateData.section988Election = Boolean(section988Election);
    }

    if (substantiallyIdenticalMethod !== undefined) {
      if (!VALID_METHODS.includes(substantiallyIdenticalMethod)) {
        return NextResponse.json(
          { error: "Invalid substantiallyIdenticalMethod. Must be METHOD_1 or METHOD_2." },
          { status: 400 }
        );
      }
      updateData.substantiallyIdenticalMethod = substantiallyIdenticalMethod;
    }

    const settings = await prisma.securitiesTaxSettings.upsert({
      where: {
        userId_year: { userId: user.id, year },
      },
      create: {
        userId: user.id,
        year,
        taxStatus: (taxStatus as string) || "INVESTOR",
        section988Election: section988Election ?? false,
        substantiallyIdenticalMethod: (substantiallyIdenticalMethod as string) || "METHOD_1",
      },
      update: updateData,
    });

    return NextResponse.json({
      status: "success",
      settings,
    });
  } catch (error) {
    console.error("[Securities Settings API] PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update securities settings" },
      { status: 500 }
    );
  }
}
