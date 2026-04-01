import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import prisma from "@/lib/prisma";

/**
 * GET /api/securities/equivalence-groups
 * Returns the user's equivalence groups for substantially identical matching.
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

    const groups = await prisma.securitiesEquivalenceGroup.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    const formatted = groups.map((g) => ({
      id: g.id,
      groupName: g.groupName,
      symbols: g.symbols,
      createdAt: g.createdAt.toISOString(),
    }));

    return NextResponse.json({
      status: "success",
      groups: formatted,
    });
  } catch (error) {
    console.error("[Equivalence Groups API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch equivalence groups" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/securities/equivalence-groups
 * Creates a new equivalence group.
 * Body: { groupName: string, symbols: string[] }
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
    const { groupName, symbols } = body;

    if (!groupName || typeof groupName !== "string" || groupName.trim().length === 0) {
      return NextResponse.json(
        { error: "Group name is required." },
        { status: 400 },
      );
    }

    if (!Array.isArray(symbols) || symbols.length < 2) {
      return NextResponse.json(
        { error: "At least two symbols are required." },
        { status: 400 },
      );
    }

    // Normalize symbols: uppercase, trim, deduplicate
    const normalizedSymbols = [
      ...new Set(
        symbols
          .map((s: unknown) => (typeof s === "string" ? s.trim().toUpperCase() : ""))
          .filter((s: string) => s.length > 0),
      ),
    ];

    if (normalizedSymbols.length < 2) {
      return NextResponse.json(
        { error: "At least two unique symbols are required after normalization." },
        { status: 400 },
      );
    }

    const group = await prisma.securitiesEquivalenceGroup.create({
      data: {
        userId: user.id,
        groupName: groupName.trim(),
        symbols: normalizedSymbols,
      },
    });

    return NextResponse.json({
      status: "success",
      group: {
        id: group.id,
        groupName: group.groupName,
        symbols: group.symbols,
        createdAt: group.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[Equivalence Groups API] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create equivalence group" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/securities/equivalence-groups?id=xxx
 * Deletes an equivalence group by ID.
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
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Group ID is required." },
        { status: 400 },
      );
    }

    // Verify ownership before deleting
    const group = await prisma.securitiesEquivalenceGroup.findFirst({
      where: { id, userId: user.id },
    });

    if (!group) {
      return NextResponse.json(
        { error: "Equivalence group not found." },
        { status: 404 },
      );
    }

    await prisma.securitiesEquivalenceGroup.delete({
      where: { id },
    });

    return NextResponse.json({
      status: "success",
      message: "Equivalence group deleted.",
    });
  } catch (error) {
    console.error("[Equivalence Groups API] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete equivalence group" },
      { status: 500 },
    );
  }
}
