import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import prisma from "@/lib/prisma";
import { parseSecuritiesCSV } from "@/lib/securities-csv-parser";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * POST /api/securities/import
 * Accepts multipart/form-data with a CSV file, parses it, validates,
 * and inserts valid rows into securities_transactions.
 */
export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = rateLimitAPI(request, 10);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset,
      );
    }

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      );
    }

    // Parse multipart form data
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid form data. Please upload a CSV file." },
        { status: 400 },
      );
    }

    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded. Please select a CSV file." },
        { status: 400 },
      );
    }

    // Validate file type
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      return NextResponse.json(
        { error: "Invalid file type. Please upload a .csv file." },
        { status: 400 },
      );
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 },
      );
    }

    // Read CSV text
    const csvText = await file.text();
    if (!csvText.trim()) {
      return NextResponse.json(
        { error: "CSV file is empty." },
        { status: 400 },
      );
    }

    // Parse the CSV
    const { transactions, errors, warnings } = parseSecuritiesCSV(csvText);

    // If there are blocking errors, return them without importing
    if (errors.length > 0) {
      return NextResponse.json(
        {
          status: "error",
          imported: 0,
          errors,
          warnings,
        },
        { status: 400 },
      );
    }

    if (transactions.length === 0) {
      return NextResponse.json({
        status: "success",
        imported: 0,
        errors: [],
        warnings: warnings.length > 0 ? warnings : ["No transactions found in CSV."],
      });
    }

    // Look up or create brokerage entries for account names
    const accountBrokerageMap = new Map<string, string>();
    const uniqueAccounts = new Set(
      transactions.filter((t) => t.account).map((t) => t.account!),
    );

    for (const accountName of uniqueAccounts) {
      // Try to find existing brokerage for this user + account name
      const existing = await prisma.brokerage.findFirst({
        where: {
          userId: user.id,
          name: accountName,
        },
      });

      if (existing) {
        accountBrokerageMap.set(accountName, existing.id);
      } else {
        // Create a new brokerage entry
        const newBrokerage = await prisma.brokerage.create({
          data: {
            userId: user.id,
            name: accountName,
            provider: "csv_import",
            accountType: transactions.find((t) => t.account === accountName)?.accountType ?? "TAXABLE",
            supportsSecurities: true,
            supportsCrypto: false,
          },
        });
        accountBrokerageMap.set(accountName, newBrokerage.id);
      }
    }

    // Build records for createMany
    const records = transactions.map((tx) => ({
      userId: user.id,
      brokerageId: tx.account ? accountBrokerageMap.get(tx.account) ?? null : null,
      date: tx.date,
      type: tx.type,
      symbol: tx.symbol,
      assetClass: tx.assetClass,
      quantity: new Decimal(tx.quantity),
      price: new Decimal(tx.price),
      fees: new Decimal(tx.fees),
      totalAmount: tx.totalAmount !== undefined ? new Decimal(tx.totalAmount) : null,
      lotId: tx.lotId ?? null,
      underlyingSymbol: tx.underlyingSymbol ?? null,
      optionType: tx.optionType ?? null,
      strikePrice: tx.strikePrice !== undefined ? new Decimal(tx.strikePrice) : null,
      expirationDate: tx.expirationDate ?? null,
      dividendType: tx.dividendType ?? null,
      isCovered: tx.isCovered,
      isSection1256: tx.isSection1256,
      notes: tx.notes ?? null,
    }));

    // Batch insert with skipDuplicates
    const result = await prisma.securitiesTransaction.createMany({
      data: records,
      skipDuplicates: true,
    });

    // Invalidate any cached securities reports
    try {
      await prisma.taxReportCache.deleteMany({
        where: { userId: user.id },
      });
    } catch {
      // Non-critical: ignore cache invalidation errors
    }

    return NextResponse.json({
      status: "success",
      imported: result.count,
      errors: [],
      warnings,
    });
  } catch (error) {
    console.error("[Securities Import API] POST error:", error);
    return NextResponse.json(
      { error: "Failed to process import" },
      { status: 500 },
    );
  }
}
