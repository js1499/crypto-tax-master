import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";

/**
 * GET /api/transactions/dumps
 * Download raw Helius dumps as CSV, filtered by wallet address.
 * Query params:
 *   - wallet: wallet address (required)
 *   - from: start date filter (ISO string, optional)
 *   - to: end date filter (ISO string, optional)
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimitResult = rateLimitAPI(request, 10);
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

    // Verify the wallet belongs to this user
    const searchParams = request.nextUrl.searchParams;
    const walletAddress = searchParams.get("wallet");

    if (!walletAddress) {
      return NextResponse.json(
        { error: "wallet query parameter is required" },
        { status: 400 }
      );
    }

    const wallet = await prisma.wallet.findFirst({
      where: { address: walletAddress, userId: user.id },
    });

    if (!wallet) {
      return NextResponse.json(
        { error: "Wallet not found or does not belong to you" },
        { status: 403 }
      );
    }

    // Build date filters
    const where: any = { wallet_address: walletAddress };
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (from) {
      where.tx_timestamp = { ...(where.tx_timestamp || {}), gte: new Date(from) };
    }
    if (to) {
      where.tx_timestamp = { ...(where.tx_timestamp || {}), lte: new Date(to) };
    }

    const rows = await prisma.heliusRawTransaction.findMany({
      where,
      orderBy: { tx_timestamp: "desc" },
    });

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No dump data found for this wallet. Try syncing the wallet first." },
        { status: 404 }
      );
    }

    // Build CSV
    const csvHeader = [
      "helius_type",
      "helius_source",
      "asset_symbol",
      "amount_value",
      "fee_lamports",
      "fee_payer",
      "tx_timestamp",
      "signature",
      "wallet_address",
      "counterparty_address",
      "slot",
      "description",
      "native_transfers_count",
      "token_transfers_count",
      "has_swap_event",
      "has_nft_event",
      "synced_at",
    ].join(",");

    const esc = (val: string) => {
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const csvRows = rows.map((row) =>
      [
        esc(row.helius_type),
        esc(row.helius_source || ""),
        esc(row.asset_symbol || ""),
        row.amount_value?.toString() || "",
        row.fee_lamports.toString(),
        esc(row.fee_payer || ""),
        row.tx_timestamp.toISOString(),
        esc(row.signature),
        esc(row.wallet_address),
        esc(row.counterparty_address || ""),
        row.slot.toString(),
        esc(row.description || ""),
        row.native_transfers_count,
        row.token_transfers_count,
        row.has_swap_event,
        row.has_nft_event,
        row.synced_at.toISOString(),
      ].join(",")
    );

    const csv = [csvHeader, ...csvRows].join("\n");
    const shortAddr = walletAddress.slice(0, 8);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="helius-dump-${shortAddr}.csv"`,
      },
    });
  } catch (error) {
    console.error("[Helius Dumps API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch dump data",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : "Unknown error") : "An internal error occurred",
      },
      { status: 500 }
    );
  }
}
