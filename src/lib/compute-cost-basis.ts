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

    // Bulk update via single raw SQL using VALUES list
    // This replaces 77+ sequential Prisma batch calls with one DB round trip
    if (results.length === 0) return;

    const CHUNK_SIZE = 5000; // Postgres can handle large VALUES lists efficiently
    for (let i = 0; i < results.length; i += CHUNK_SIZE) {
      const chunk = results.slice(i, i + CHUNK_SIZE);
      const valuesList = chunk.map(r => {
        const cb = r.costBasisUsd !== null ? r.costBasisUsd.toString() : 'NULL';
        const gl = r.gainLossUsd !== null ? r.gainLossUsd.toString() : 'NULL';
        return `(${r.transactionId}, ${cb}::numeric(30,15), ${gl}::numeric(30,15))`;
      }).join(',\n');

      await prisma.$executeRawUnsafe(`
        UPDATE transactions AS t
        SET cost_basis_usd = v.cb, gain_loss_usd = v.gl
        FROM (VALUES ${valuesList}) AS v(id, cb, gl)
        WHERE t.id = v.id
      `);
    }

    console.log(`[Cost Basis] Auto-computed for ${results.length} transactions (${costBasisMethod})`);
  } catch (error) {
    // Never throw — this runs as a background step after sync/import
    console.error("[Cost Basis] Auto-compute failed:", error);
  }
}
