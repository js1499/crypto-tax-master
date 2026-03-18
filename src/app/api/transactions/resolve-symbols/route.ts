import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import { getHeliusTokenData, getJupiterTokenMap } from "@/lib/helius-transactions";
import * as Sentry from "@sentry/nextjs";
import { invalidateTaxReportCache } from "@/lib/tax-report-cache";

/**
 * POST /api/transactions/resolve-symbols
 * Retroactively resolve truncated token symbols (e.g. "EPjFWd...") to
 * human-readable names (e.g. "USDC") using Helius DAS + Jupiter fallback.
 *
 * Returns: { resolved, stillUnresolved, total }
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting — heavy operation
    const rateLimitResult = rateLimitAPI(request, 5);
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

    // Get user's wallet addresses for scoping
    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });

    const walletAddresses = userWithWallets?.wallets.map((w) => w.address) || [];
    if (walletAddresses.length === 0) {
      return NextResponse.json({
        status: "success",
        resolved: 0,
        stillUnresolved: 0,
        total: 0,
        message: "No wallets found for user",
      });
    }

    // Find transactions with truncated asset_symbol
    const unresolvedAsset = await prisma.transaction.findMany({
      where: {
        wallet_address: { in: walletAddresses },
        asset_symbol: { endsWith: "..." },
        asset_address: { not: null },
      },
      select: {
        id: true,
        asset_symbol: true,
        asset_address: true,
      },
    });

    // Find transactions with truncated incoming_asset_symbol
    const unresolvedIncoming = await prisma.transaction.findMany({
      where: {
        wallet_address: { in: walletAddresses },
        incoming_asset_symbol: { endsWith: "..." },
        asset_address: { not: null },
      },
      select: {
        id: true,
        incoming_asset_symbol: true,
        asset_address: true,
        tx_hash: true,
      },
    });

    const totalUnresolved = unresolvedAsset.length + unresolvedIncoming.length;
    if (totalUnresolved === 0) {
      return NextResponse.json({
        status: "success",
        resolved: 0,
        stillUnresolved: 0,
        total: 0,
        message: "No unresolved symbols found",
      });
    }

    // Collect unique mint addresses
    const mintsToResolve = new Set<string>();
    for (const tx of unresolvedAsset) {
      if (tx.asset_address) mintsToResolve.add(tx.asset_address);
    }
    for (const tx of unresolvedIncoming) {
      if (tx.asset_address) mintsToResolve.add(tx.asset_address);
    }

    console.log(
      `[Resolve Symbols] Found ${totalUnresolved} unresolved transactions, ${mintsToResolve.size} unique mints`
    );

    // Step 1: Try Helius DAS resolution
    const mintArray = [...mintsToResolve];
    const { metadata } = await getHeliusTokenData(mintArray);

    // Step 2: Jupiter fallback for any still-unresolved mints
    const resolvedMints = new Set(metadata.keys());
    const stillMissing = mintArray.filter((m) => !resolvedMints.has(m));

    if (stillMissing.length > 0) {
      console.log(
        `[Resolve Symbols] ${stillMissing.length} mints not in Helius, trying Jupiter fallback...`
      );
      const jupiterMap = await getJupiterTokenMap();
      for (const mint of stillMissing) {
        const sym = jupiterMap.get(mint);
        if (sym) {
          metadata.set(mint, { symbol: sym, name: sym });
        }
      }
    }

    console.log(
      `[Resolve Symbols] Resolved ${metadata.size}/${mintsToResolve.size} mints`
    );

    // Step 3: Batch update DB — group by mint for efficiency
    let resolvedCount = 0;

    // Update asset_symbol
    for (const [mint, meta] of metadata) {
      const result = await prisma.transaction.updateMany({
        where: {
          wallet_address: { in: walletAddresses },
          asset_address: mint,
          asset_symbol: { endsWith: "..." },
        },
        data: { asset_symbol: meta.symbol },
      });
      resolvedCount += result.count;
    }

    // Update incoming_asset_symbol where asset_address matches
    // (incoming swaps where the outgoing asset_address is stored)
    for (const [mint, meta] of metadata) {
      const result = await prisma.transaction.updateMany({
        where: {
          wallet_address: { in: walletAddresses },
          asset_address: mint,
          incoming_asset_symbol: { endsWith: "..." },
        },
        data: { incoming_asset_symbol: meta.symbol },
      });
      resolvedCount += result.count;
    }

    const finalUnresolved = mintsToResolve.size - metadata.size;

    console.log(
      `[Resolve Symbols] Done: ${resolvedCount} DB records updated, ${finalUnresolved} mints still unresolved`
    );

    // Invalidate tax report cache after symbol resolution updates
    if (resolvedCount > 0) {
      await invalidateTaxReportCache(user.id);
    }

    return NextResponse.json({
      status: "success",
      resolved: resolvedCount,
      stillUnresolved: finalUnresolved,
      total: totalUnresolved,
      message: `Resolved ${resolvedCount} transaction(s). ${finalUnresolved} mint(s) could not be resolved.`,
    });
  } catch (error) {
    console.error("[Resolve Symbols API] Error:", error);

    Sentry.captureException(error, {
      tags: { endpoint: "/api/transactions/resolve-symbols" },
    });

    return NextResponse.json(
      {
        error: "Failed to resolve symbols",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : "Unknown error") : "An internal error occurred",
      },
      { status: 500 }
    );
  }
}
