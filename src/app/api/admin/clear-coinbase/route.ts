import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";

/**
 * DELETE /api/admin/clear-coinbase
 * Clears all Coinbase exchange entries for the current user
 * This is a one-time cleanup endpoint
 */
export async function DELETE(request: NextRequest) {
  try {
    // Get authenticated user
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Delete Coinbase exchange entry for this user
    const result = await prisma.exchange.deleteMany({
      where: {
        name: "coinbase",
        userId: user.id,
      },
    });

    console.log(`[Clear Coinbase] Deleted ${result.count} Coinbase entry for user ${user.id}`);

    return NextResponse.json({
      status: "success",
      message: `Deleted ${result.count} Coinbase exchange entry`,
      deleted: result.count,
    });
  } catch (error) {
    console.error("[Clear Coinbase] Error:", error);
    return NextResponse.json(
      { error: "Failed to clear Coinbase entries" },
      { status: 500 }
    );
  }
}
