import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * POST /api/transactions/bulk
 * Perform bulk operations on transactions
 * Body: {
 *   operation: "update" | "delete" | "merge",
 *   transactionIds: number[],
 *   updates?: { [key: string]: any } (for update operation)
 *   mergeIntoId?: number (for merge operation)
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 50); // Lower limit for bulk operations
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }

    // Get user authentication - pass request for proper Vercel session handling
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { operation, transactionIds, updates, mergeIntoId } = body;

    if (!operation || !Array.isArray(transactionIds) || transactionIds.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: operation and transactionIds" },
        { status: 400 }
      );
    }

    // Verify all transactions belong to user
    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });

    const walletAddresses =
      userWithWallets && userWithWallets.wallets.length > 0
        ? userWithWallets.wallets.map((w) => w.address)
        : [];

    // BUG-026 fix: Check ownership via wallet_address OR userId for CSV imports
    const orConditions: Prisma.TransactionWhereInput[] = [];
    if (walletAddresses.length > 0) {
      orConditions.push({ wallet_address: { in: walletAddresses } });
    }
    // Include transactions owned by user (CSV imports with userId)
    orConditions.push({ userId: user.id });
    // Legacy support: CSV imports without userId but with source_type
    orConditions.push({
      AND: [
        { source_type: "csv_import" },
        { wallet_address: null },
        { userId: null },
      ],
    });

    const transactions = await prisma.transaction.findMany({
      where: {
        id: { in: transactionIds },
        OR: orConditions,
      },
    });

    if (transactions.length !== transactionIds.length) {
      return NextResponse.json(
        { error: "Some transactions not found or unauthorized" },
        { status: 403 }
      );
    }

    let result: any = {};

    switch (operation) {
      case "update":
        if (!updates) {
          return NextResponse.json(
            { error: "Missing updates for update operation" },
            { status: 400 }
          );
        }

        const updateData: Prisma.TransactionUpdateInput = {};
        if (updates.type !== undefined) updateData.type = updates.type;
        if (updates.subtype !== undefined) updateData.subtype = updates.subtype;
        if (updates.status !== undefined) updateData.status = updates.status;
        if (updates.identified !== undefined)
          updateData.identified = updates.identified;
        if (updates.notes !== undefined) updateData.notes = updates.notes;

        const updateResult = await prisma.transaction.updateMany({
          where: { id: { in: transactionIds } },
          data: updateData,
        });

        result = {
          updated: updateResult.count,
          message: `Updated ${updateResult.count} transaction(s)`,
        };
        break;

      case "delete":
        const deleteResult = await prisma.transaction.deleteMany({
          where: { id: { in: transactionIds } },
        });

        result = {
          deleted: deleteResult.count,
          message: `Deleted ${deleteResult.count} transaction(s)`,
        };
        break;

      case "merge":
        if (!mergeIntoId || !transactionIds.includes(mergeIntoId)) {
          return NextResponse.json(
            { error: "Invalid mergeIntoId" },
            { status: 400 }
          );
        }

        const transactionsToMerge = transactions.filter(
          (tx) => tx.id !== mergeIntoId
        );
        const targetTransaction = transactions.find(
          (tx) => tx.id === mergeIntoId
        );

        if (!targetTransaction) {
          return NextResponse.json(
            { error: "Target transaction not found" },
            { status: 404 }
          );
        }

        // Merge logic: combine amounts and values
        let mergedAmount = Number(targetTransaction.amount_value);
        let mergedValue = Number(targetTransaction.value_usd);
        let mergedFee = Number(targetTransaction.fee_usd || 0);

        for (const tx of transactionsToMerge) {
          mergedAmount += Number(tx.amount_value);
          mergedValue += Number(tx.value_usd);
          mergedFee += Number(tx.fee_usd || 0);
        }

        // Update target transaction with merged values
        await prisma.transaction.update({
          where: { id: mergeIntoId },
          data: {
            amount_value: new Decimal(mergedAmount),
            value_usd: new Decimal(mergedValue),
            fee_usd: mergedFee > 0 ? new Decimal(mergedFee) : null,
            notes: targetTransaction.notes
              ? `${targetTransaction.notes}\n[Merged ${transactionsToMerge.length} duplicate transactions]`
              : `[Merged ${transactionsToMerge.length} duplicate transactions]`,
          },
        });

        // Delete merged transactions
        const idsToDelete = transactionsToMerge.map((tx) => tx.id);
        await prisma.transaction.deleteMany({
          where: { id: { in: idsToDelete } },
        });

        result = {
          merged: transactionsToMerge.length,
          kept: mergeIntoId,
          message: `Merged ${transactionsToMerge.length} transaction(s) into transaction #${mergeIntoId}`,
        };
        break;

      default:
        return NextResponse.json(
          { error: `Unknown operation: ${operation}` },
          { status: 400 }
        );
    }

    return NextResponse.json({
      status: "success",
      ...result,
    });
  } catch (error) {
    console.error("[Bulk Transactions API] Error:", error);

    Sentry.captureException(error, {
      tags: {
        endpoint: "/api/transactions/bulk",
      },
    });

    return NextResponse.json(
      {
        error: "Failed to perform bulk operation",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
