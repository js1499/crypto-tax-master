import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import prisma from "@/lib/prisma";

/**
 * GET /api/securities/section-1256-symbols
 * Returns all Section 1256 qualifying symbols (default + user-added).
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = rateLimitAPI(request, 100);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset,
      );
    }

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      );
    }

    const symbols = await prisma.securitiesSection1256Symbol.findMany({
      orderBy: { symbol: "asc" },
    });

    const formatted = symbols.map((s) => ({
      id: s.id,
      symbol: s.symbol,
      description: s.description,
      isDefault: s.isDefault,
    }));

    return NextResponse.json({
      status: "success",
      symbols: formatted,
    });
  } catch (error) {
    console.error("[Section 1256 Symbols API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Section 1256 symbols" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/securities/section-1256-symbols
 * Adds a custom Section 1256 qualifying symbol.
 * Body: { symbol: string, description?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = rateLimitAPI(request, 30);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset,
      );
    }

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { symbol, description } = body;

    if (!symbol || typeof symbol !== "string" || symbol.trim().length === 0) {
      return NextResponse.json(
        { error: "Symbol is required." },
        { status: 400 },
      );
    }

    const normalizedSymbol = symbol.trim().toUpperCase();

    if (normalizedSymbol.length > 20) {
      return NextResponse.json(
        { error: "Symbol must be 20 characters or fewer." },
        { status: 400 },
      );
    }

    // Check if symbol already exists
    const existing = await prisma.securitiesSection1256Symbol.findUnique({
      where: { symbol: normalizedSymbol },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Symbol "${normalizedSymbol}" already exists.` },
        { status: 409 },
      );
    }

    const created = await prisma.securitiesSection1256Symbol.create({
      data: {
        symbol: normalizedSymbol,
        description: description?.trim() || null,
        isDefault: false,
      },
    });

    return NextResponse.json({
      status: "success",
      symbol: {
        id: created.id,
        symbol: created.symbol,
        description: created.description,
        isDefault: created.isDefault,
      },
    });
  } catch (error) {
    console.error("[Section 1256 Symbols API] POST error:", error);
    return NextResponse.json(
      { error: "Failed to add Section 1256 symbol" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/securities/section-1256-symbols?symbol=XXX
 * Removes a Section 1256 qualifying symbol by symbol name.
 */
export async function DELETE(request: NextRequest) {
  try {
    const rateLimitResult = rateLimitAPI(request, 30);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset,
      );
    }

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol");

    if (!symbol || symbol.trim().length === 0) {
      return NextResponse.json(
        { error: "Symbol query parameter is required." },
        { status: 400 },
      );
    }

    const normalizedSymbol = symbol.trim().toUpperCase();

    const existing = await prisma.securitiesSection1256Symbol.findUnique({
      where: { symbol: normalizedSymbol },
    });

    if (!existing) {
      return NextResponse.json(
        { error: `Symbol "${normalizedSymbol}" not found.` },
        { status: 404 },
      );
    }

    await prisma.securitiesSection1256Symbol.delete({
      where: { symbol: normalizedSymbol },
    });

    return NextResponse.json({
      status: "success",
      message: `Symbol "${normalizedSymbol}" removed.`,
    });
  } catch (error) {
    console.error("[Section 1256 Symbols API] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete Section 1256 symbol" },
      { status: 500 },
    );
  }
}
