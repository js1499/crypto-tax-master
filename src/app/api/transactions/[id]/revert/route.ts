import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";
import { Decimal } from "@prisma/client/runtime/library";
import { isOutflow } from "@/lib/transaction-categorizer";
import { invalidateTaxReportCache } from "@/lib/tax-report-cache";
import { diffChanges, recordEditHistory, buildRevertPayload } from "@/lib/transaction-history";

/**
 * POST /api/transactions/:id/revert
 * Revert a transaction to a previous version
 * Body: { targetVersion: number } or { undo: true }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 100);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }

    // Get user authentication
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const transactionId = parseInt(params.id);
    if (isNaN(transactionId)) {
      return NextResponse.json(
        { error: "Invalid transaction ID" },
        { status: 400 }
      );
    }

    // Verify transaction belongs to user
    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });

    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    // BUG-003 fix: Check if transaction belongs to user (via wallet OR userId)
    const walletAddresses = userWithWallets?.wallets.map((w) => w.address) || [];
    const isWalletOwned = transaction.wallet_address && walletAddresses.includes(transaction.wallet_address);
    const isUserOwned = transaction.userId === user.id;
    const isCsvImportWithoutOwner = transaction.source_type === "csv_import" && !transaction.userId && !transaction.wallet_address;

    if (!isWalletOwned && !isUserOwned && !isCsvImportWithoutOwner) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await request.json();
    let targetVersion: number;

    if (body.undo === true) {
      targetVersion = (transaction.edit_version ?? 0) - 1;
    } else if (typeof body.targetVersion === "number") {
      targetVersion = body.targetVersion;
    } else {
      return NextResponse.json(
        { error: "Must provide targetVersion (number) or undo (true)" },
        { status: 400 }
      );
    }

    if (targetVersion < 0) {
      return NextResponse.json(
        { error: "Cannot revert before version 0 (original state)" },
        { status: 400 }
      );
    }

    if (targetVersion >= (transaction.edit_version ?? 0)) {
      return NextResponse.json(
        { error: "Target version must be less than current version" },
        { status: 400 }
      );
    }

    // Build the revert payload
    const revertPayload = await buildRevertPayload(transactionId, targetVersion);

    if (Object.keys(revertPayload).length === 0) {
      return NextResponse.json(
        { error: "No changes to revert" },
        { status: 400 }
      );
    }

    // Compute diff between current state and revert payload
    const changes = diffChanges(transaction as Record<string, any>, revertPayload);

    if (changes.length === 0) {
      return NextResponse.json(
        { error: "No effective changes to revert" },
        { status: 400 }
      );
    }

    // Build Prisma-compatible update data with proper types
    const updateData: Record<string, any> = {};
    for (const [field, value] of Object.entries(revertPayload)) {
      if (["amount_value", "price_per_unit", "value_usd", "fee_usd", "incoming_amount_value", "incoming_value_usd"].includes(field)) {
        updateData[field] = value !== null ? new Decimal(value) : null;
      } else {
        updateData[field] = value;
      }
    }

    const newVersion = (transaction.edit_version ?? 0) + 1;

    // Record the revert in edit history
    await recordEditHistory(transaction.id, newVersion, changes, user.id, true);
    updateData.edit_version = newVersion;

    // Apply the revert
    const updatedTransaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: updateData,
      select: {
        id: true,
        type: true,
        asset_symbol: true,
        amount_value: true,
        price_per_unit: true,
        value_usd: true,
        source: true,
        tx_timestamp: true,
        status: true,
        identified: true,
        notes: true,
        chain: true,
        tx_hash: true,
        incoming_asset_symbol: true,
        incoming_amount_value: true,
        incoming_value_usd: true,
        edit_version: true,
      },
    });

    // Invalidate tax report cache after revert
    await invalidateTaxReportCache(user.id);

    // Format response (same pattern as PATCH handler)
    const amountValue = Number(updatedTransaction.amount_value);
    const valueUsd = Number(updatedTransaction.value_usd);
    const pricePerUnit = updatedTransaction.price_per_unit
      ? Number(updatedTransaction.price_per_unit)
      : valueUsd / amountValue;

    const amount = `${amountValue} ${updatedTransaction.asset_symbol}`;
    const price = `$${pricePerUnit.toFixed(2)}`;

    let value = `$${Math.abs(valueUsd).toFixed(2)}`;
    if (isOutflow(updatedTransaction.type)) {
      value = `-${value}`;
    }

    return NextResponse.json({
      status: "success",
      revertedToVersion: targetVersion,
      transaction: {
        id: updatedTransaction.id,
        type: updatedTransaction.type,
        asset: updatedTransaction.asset_symbol,
        amount,
        price,
        value,
        date: updatedTransaction.tx_timestamp.toISOString(),
        status: updatedTransaction.status,
        exchange: updatedTransaction.source || "Unknown",
        identified: updatedTransaction.identified || false,
        notes: updatedTransaction.notes || "",
        chain: updatedTransaction.chain,
        txHash: updatedTransaction.tx_hash,
        incomingAsset: updatedTransaction.incoming_asset_symbol || null,
        incomingAmount: updatedTransaction.incoming_amount_value ? Number(updatedTransaction.incoming_amount_value) : null,
        incomingValueUsd: updatedTransaction.incoming_value_usd ? Number(updatedTransaction.incoming_value_usd) : null,
        editVersion: updatedTransaction.edit_version,
      },
    });
  } catch (error) {
    console.error("[Transaction Revert API] Error:", error);

    Sentry.captureException(error, {
      tags: {
        endpoint: "/api/transactions/[id]/revert",
        method: "POST",
      },
    });

    return NextResponse.json(
      {
        error: "Failed to revert transaction",
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : "Unknown error") : "An internal error occurred",
      },
      { status: 500 }
    );
  }
}
