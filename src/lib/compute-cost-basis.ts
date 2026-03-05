import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { computeCostBasisForTransactions } from "@/lib/tax-calculator";

/**
 * Recompute cost basis and gain/loss for all of a user's transactions.
 * Called automatically after sync/import, and manually via /api/cost-basis/compute.
 * Fire-and-forget safe — errors are logged but never thrown.
 */
export async function recomputeCostBasis(userId: string): Promise<void> {
  try {
    const userWithWallets = await prisma.user.findUnique({
      where: { id: userId },
      include: { wallets: true },
    });

    if (!userWithWallets) return;

    const walletAddresses = userWithWallets.wallets.map(w => w.address);
    const costBasisMethod = (userWithWallets.costBasisMethod || "FIFO") as "FIFO" | "LIFO" | "HIFO";

    // Build query conditions (same logic as cost-basis/compute endpoint)
    const orConditions: Prisma.TransactionWhereInput[] = [];

    if (walletAddresses.length > 0) {
      orConditions.push({ wallet_address: { in: walletAddresses } });
    }

    orConditions.push({
      AND: [{ source_type: "csv_import" }, { wallet_address: null }],
    });

    const userExchanges = await prisma.exchange.findMany({
      where: { userId },
      select: { name: true },
    });
    const exchangeNames = userExchanges.map(e => e.name);
    if (exchangeNames.length > 0) {
      orConditions.push({
        AND: [{ source_type: "exchange_api" }, { source: { in: exchangeNames } }],
      });
    }

    const allTransactions = await prisma.transaction.findMany({
      where: {
        OR: orConditions,
        status: { in: ["confirmed", "completed", "pending"] },
      },
      orderBy: { tx_timestamp: "asc" },
    });

    if (allTransactions.length === 0) return;

    const results = computeCostBasisForTransactions(
      allTransactions,
      costBasisMethod,
      walletAddresses
    );

    // Batch update
    const BATCH_SIZE = 500;
    for (let i = 0; i < results.length; i += BATCH_SIZE) {
      const batch = results.slice(i, i + BATCH_SIZE);
      await prisma.$transaction(
        batch.map(r =>
          prisma.transaction.update({
            where: { id: r.transactionId },
            data: {
              cost_basis_usd: r.costBasisUsd !== null ? new Prisma.Decimal(r.costBasisUsd) : null,
              gain_loss_usd: r.gainLossUsd !== null ? new Prisma.Decimal(r.gainLossUsd) : null,
            },
          })
        )
      );
    }

    console.log(`[Cost Basis] Auto-computed for ${results.length} transactions (${costBasisMethod})`);
  } catch (error) {
    // Never throw — this runs as a background step after sync/import
    console.error("[Cost Basis] Auto-compute failed:", error);
  }
}
