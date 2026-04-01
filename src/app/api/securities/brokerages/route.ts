import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";

/**
 * GET /api/securities/brokerages
 * List all brokerage accounts for the current user
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const brokerages = await prisma.brokerage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  // Get transaction counts per brokerage
  const txCounts = await prisma.securitiesTransaction.groupBy({
    by: ["brokerageId"],
    where: { userId: user.id },
    _count: { id: true },
  });
  const countMap = new Map(txCounts.map((c) => [c.brokerageId, c._count.id]));

  return NextResponse.json({
    brokerages: brokerages.map((b) => ({
      id: b.id,
      name: b.name,
      provider: b.provider,
      accountNumber: b.accountNumber,
      accountType: b.accountType,
      isConnected: b.isConnected,
      lastSyncAt: b.lastSyncAt,
      createdAt: b.createdAt,
      transactionCount: countMap.get(b.id) || 0,
    })),
  });
}

/**
 * POST /api/securities/brokerages
 * Create a new brokerage account
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { name, provider, accountType, accountNumber } = body;

  if (!name || !provider) {
    return NextResponse.json(
      { error: "Name and provider are required" },
      { status: 400 },
    );
  }

  const brokerage = await prisma.brokerage.create({
    data: {
      userId: user.id,
      name: name.trim(),
      provider: provider.trim(),
      accountType: accountType || "TAXABLE",
      accountNumber: accountNumber?.trim() || null,
      isConnected: false,
    },
  });

  return NextResponse.json({ status: "success", brokerage });
}

/**
 * DELETE /api/securities/brokerages
 * Delete a brokerage and all its transactions
 */
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser(request);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const brokerageId = searchParams.get("brokerageId");
  if (!brokerageId) {
    return NextResponse.json(
      { error: "brokerageId is required" },
      { status: 400 },
    );
  }

  // Verify ownership
  const brokerage = await prisma.brokerage.findFirst({
    where: { id: brokerageId, userId: user.id },
  });
  if (!brokerage) {
    return NextResponse.json(
      { error: "Brokerage not found" },
      { status: 404 },
    );
  }

  // Delete transactions, then brokerage
  const deleted = await prisma.securitiesTransaction.deleteMany({
    where: { brokerageId, userId: user.id },
  });

  await prisma.brokerage.delete({ where: { id: brokerageId } });

  return NextResponse.json({
    status: "success",
    deletedTransactions: deleted.count,
  });
}
