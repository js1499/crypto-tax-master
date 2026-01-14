import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

/**
 * PATCH /api/transactions/:id
 * Update a transaction
 */
export async function PATCH(
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
    const user = await getCurrentUser();
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

    // Check if transaction belongs to user (via wallet)
    if (userWithWallets && userWithWallets.wallets.length > 0) {
      const walletAddresses = userWithWallets.wallets.map((w) => w.address);
      if (
        transaction.wallet_address &&
        !walletAddresses.includes(transaction.wallet_address)
      ) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 403 }
        );
      }
    }

    // Parse request body
    const body = await request.json();
    const updateData: Prisma.TransactionUpdateInput = {};

    // Update fields
    if (body.type !== undefined) updateData.type = body.type;
    if (body.subtype !== undefined) updateData.subtype = body.subtype;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.source !== undefined) updateData.source = body.source;
    if (body.asset_symbol !== undefined) updateData.asset_symbol = body.asset_symbol;
    if (body.identified !== undefined) updateData.identified = body.identified;
    if (body.notes !== undefined) updateData.notes = body.notes;

    // Update financial fields
    if (body.amount_value !== undefined) {
      updateData.amount_value = new Decimal(body.amount_value);
    }
    if (body.price_per_unit !== undefined) {
      updateData.price_per_unit = body.price_per_unit
        ? new Decimal(body.price_per_unit)
        : null;
    }
    if (body.value_usd !== undefined) {
      updateData.value_usd = new Decimal(body.value_usd);
    }
    if (body.fee_usd !== undefined) {
      updateData.fee_usd = body.fee_usd ? new Decimal(body.fee_usd) : null;
    }

    // Update swap fields
    if (body.incoming_asset_symbol !== undefined)
      updateData.incoming_asset_symbol = body.incoming_asset_symbol;
    if (body.incoming_amount_value !== undefined) {
      updateData.incoming_amount_value = body.incoming_amount_value
        ? new Decimal(body.incoming_amount_value)
        : null;
    }
    if (body.incoming_value_usd !== undefined) {
      updateData.incoming_value_usd = body.incoming_value_usd
        ? new Decimal(body.incoming_value_usd)
        : null;
    }

    // Update timestamp
    if (body.tx_timestamp !== undefined) {
      updateData.tx_timestamp = new Date(body.tx_timestamp);
    }

    // Update transaction
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
      },
    });

    // Format response
    const amountValue = Number(updatedTransaction.amount_value);
    const valueUsd = Number(updatedTransaction.value_usd);
    const pricePerUnit = updatedTransaction.price_per_unit
      ? Number(updatedTransaction.price_per_unit)
      : valueUsd / amountValue;

    const amount = `${amountValue} ${updatedTransaction.asset_symbol}`;
    const price = `$${pricePerUnit.toFixed(2)}`;

    let value = `$${Math.abs(valueUsd).toFixed(2)}`;
    if (
      updatedTransaction.type === "Buy" ||
      updatedTransaction.type === "DCA"
    ) {
      value = `-${value}`;
    } else if (updatedTransaction.type === "Sell" && valueUsd < 0) {
      value = `-${value}`;
    }

    return NextResponse.json({
      status: "success",
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
      },
    });
  } catch (error) {
    console.error("[Update Transaction API] Error:", error);

    Sentry.captureException(error, {
      tags: {
        endpoint: "/api/transactions/[id]",
        method: "PATCH",
      },
    });

    return NextResponse.json(
      {
        error: "Failed to update transaction",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * DELETE /api/transactions/:id
 * Delete a transaction
 */
export async function DELETE(
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
    const user = await getCurrentUser();
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

    // Check if transaction belongs to user (via wallet)
    if (userWithWallets && userWithWallets.wallets.length > 0) {
      const walletAddresses = userWithWallets.wallets.map((w) => w.address);
      if (
        transaction.wallet_address &&
        !walletAddresses.includes(transaction.wallet_address)
      ) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 403 }
        );
      }
    }

    // Delete transaction
    await prisma.transaction.delete({
      where: { id: transactionId },
    });

    return NextResponse.json({
      status: "success",
      message: "Transaction deleted successfully",
    });
  } catch (error) {
    console.error("[Delete Transaction API] Error:", error);

    Sentry.captureException(error, {
      tags: {
        endpoint: "/api/transactions/[id]",
        method: "DELETE",
      },
    });

    return NextResponse.json(
      {
        error: "Failed to delete transaction",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
