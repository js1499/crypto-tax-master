import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

// Initialize Prisma client
const prisma = new PrismaClient();

/**
 * API route to fetch user wallets from the database
 */
export async function GET(request: NextRequest) {
  console.log("[Wallets API] Fetching wallets");
  
  try {
    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 60); // 60 requests per minute
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }
    // Get user authentication via NextAuth
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }
    
    // Find the user in our database with wallets
    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true }
    });
    
    if (!userWithWallets) {
      console.error("[Wallets API] User not found in database");
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }
    
    // Format the wallets for the frontend
    const wallets = userWithWallets.wallets.map(wallet => ({
      id: wallet.id,
      name: wallet.name,
      address: wallet.address,
      provider: wallet.provider,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt
    }));
    
    // Return the wallets
    return NextResponse.json({
      status: "success",
      wallets
    });
  } catch (error) {
    console.error("[Wallets API] Error fetching wallets:", error);
    return NextResponse.json(
      { error: "Failed to fetch wallets" },
      { status: 500 }
    );
  } finally {
    // Disconnect from Prisma to avoid connection leaking
    await prisma.$disconnect();
  }
}
