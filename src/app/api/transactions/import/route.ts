import { NextRequest, NextResponse } from "next/server";
import { PrismaClient, Prisma } from "@prisma/client";
import { CoinbaseUser } from "@/lib/coinbase";
import { parseCSV, ExchangeCSVParser } from "@/lib/csv-parser";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse, rateLimitByUser } from "@/lib/rate-limit";
import { categorizeTransactionData } from "@/lib/transaction-categorizer";
import * as Sentry from "@sentry/nextjs";
import { logBuffer } from "@/lib/log-buffer";

// Increase body size limit for large CSV uploads (50MB)
export const maxDuration = 300; // 5 minutes max execution time (Vercel Pro limit)
export const runtime = 'nodejs';
// Note: Next.js App Router doesn't have a bodyParser config option
// Form data size is handled by the server infrastructure
// For Vercel, the limit is 4.5MB by default, but can be increased with serverless function config
// Vercel Free/Pro: Max 300s, Vercel Enterprise: Max 900s

const prisma = new PrismaClient();

/**
 * POST /api/transactions/import
 * Import transactions from CSV file
 * Body: FormData with file and exchange fields
 */
export async function POST(request: NextRequest) {
  let fileName = "unknown";
  let exchange = "unknown";
  
  // Log import start - write immediately to verify it works
  // Also verify log buffer is accessible
  try {
    logBuffer.log(`[Import] ===== CSV IMPORT STARTED =====`);
    console.log(`[Import] CSV import started - also writing to console`);
    console.log(`[Import] Log buffer instance: ${logBuffer.constructor.name}, stats:`, logBuffer.getStats());
  } catch (logError) {
    console.error(`[Import] Failed to write to log buffer:`, logError);
  }
  
  try {
    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 20); // 20 imports per minute
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }
    
    // Get user authentication via NextAuth
    let user;
    try {
      user = await getCurrentUser(request);
    } catch (authError) {
      console.error("[Import] Auth error:", authError);
      return NextResponse.json(
        {
          status: "error",
          error: "Authentication failed",
          details: authError instanceof Error ? authError.message : "Unknown authentication error",
        },
        { status: 401 }
      );
    }
    
    if (!user) {
      return NextResponse.json(
        {
          status: "error",
          error: "Not authenticated",
        },
        { status: 401 }
      );
    }
    
    // Additional rate limiting by user
    const userRateLimit = rateLimitByUser(user.id, 10); // 10 imports per minute per user
    if (!userRateLimit.success) {
      return createRateLimitResponse(
        userRateLimit.remaining,
        userRateLimit.reset
      );
    }

    // Parse form data with error handling
    let formData: FormData;
    let file: File | null = null;
    try {
      // Log request details for debugging
      const contentType = request.headers.get("content-type");
      const contentLength = request.headers.get("content-length");
      const contentLengthNum = contentLength ? parseInt(contentLength, 10) : null;
      console.log(`[Import] Request headers - Content-Type: ${contentType}, Content-Length: ${contentLength} (${contentLengthNum ? (contentLengthNum / 1024 / 1024).toFixed(2) + "MB" : "unknown"})`);
      
      // Check if request has body
      if (!contentType) {
        console.error(`[Import] No Content-Type header found`);
        return NextResponse.json(
          {
            status: "error",
            error: "Failed to parse form data",
            details: "Request is missing Content-Type header. Please ensure the file is being uploaded correctly.",
          },
          { status: 400 }
        );
      }
      
      if (!contentType.includes("multipart/form-data")) {
        console.warn(`[Import] Unexpected Content-Type: ${contentType}. Expected multipart/form-data`);
        // Don't fail here - some proxies might modify the content-type
      }
      
      // Check if content length is reasonable
      if (contentLengthNum && contentLengthNum > 50 * 1024 * 1024) {
        console.warn(`[Import] Large file detected: ${(contentLengthNum / 1024 / 1024).toFixed(2)}MB`);
      }
      
      // Attempt to parse form data
      // Note: Next.js handles form data parsing internally, but large files might take time
      formData = await request.formData();
      console.log(`[Import] FormData parsed successfully`);
      
      // Get file and exchange from form data
      file = formData.get("file") as File;
      exchange = (formData.get("exchange") as string) || "unknown";
      fileName = file?.name || "unknown";
      
      console.log(`[Import] File extracted: ${fileName}, Exchange: ${exchange}, File size: ${file?.size || 0} bytes`);
      
      // Validate form data was parsed correctly
      if (!file && formData.has("file")) {
        const fileEntry = formData.get("file");
        console.error(`[Import] File entry exists but is not a File object:`, typeof fileEntry, fileEntry);
        return NextResponse.json(
          {
            status: "error",
            error: "Invalid file in form data",
            details: "The file field exists but is not a valid file object.",
          },
          { status: 400 }
        );
      }
      
      if (!file) {
        return NextResponse.json(
          {
            status: "error",
            error: "No file provided",
            details: "The form data does not contain a file field.",
          },
          { status: 400 }
        );
      }
    } catch (formError) {
      console.error("[Import] Error parsing form data:", formError);
      console.error("[Import] Form error stack:", formError instanceof Error ? formError.stack : "No stack");
      console.error("[Import] Form error details:", {
        name: formError instanceof Error ? formError.name : "Unknown",
        message: formError instanceof Error ? formError.message : String(formError),
      });
      
      // Check for specific error types
      const errorMessage = formError instanceof Error ? formError.message : "Unknown error";
      let details = errorMessage;
      
      if (errorMessage.includes("body") || errorMessage.includes("size") || errorMessage.includes("limit") || errorMessage.includes("413")) {
        details = `Request body too large or invalid. ${errorMessage}. The file might be too large. Try splitting your CSV into smaller files (max 50MB per file).`;
      } else if (errorMessage.includes("timeout") || errorMessage.includes("timed out")) {
        details = `Request timed out while parsing form data (${errorMessage}). The file might be too large or the connection is slow. Try splitting your CSV into smaller files.`;
      } else if (errorMessage.includes("network") || errorMessage.includes("connection") || errorMessage.includes("ECONNRESET")) {
        details = `Network error while parsing form data. ${errorMessage}. Please check your internet connection and try again.`;
      } else if (errorMessage.includes("aborted") || errorMessage.includes("AbortError")) {
        details = `Request was aborted. ${errorMessage}. This might happen if the file is too large or the upload takes too long.`;
      }
      
      return NextResponse.json(
        {
          status: "error",
          error: "Failed to parse form data",
          details: details.length > 500 ? details.substring(0, 500) + "..." : details,
          contentType: request.headers.get("content-type") || "unknown",
          contentLength: request.headers.get("content-length") || "unknown",
          errorType: formError instanceof Error ? formError.name : "Unknown",
        },
        { 
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // File validation is now done in the form data parsing section above

    if (!exchange) {
      return NextResponse.json(
        {
          status: "error",
          error: "No exchange specified",
        },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.endsWith(".csv")) {
      return NextResponse.json(
        {
          status: "error",
          error: "File must be a CSV file",
        },
        { status: 400 }
      );
    }

    // Check file size (limit to 50MB)
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          status: "error",
          error: "File too large",
          details: `File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size of ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB. Please split your CSV into smaller files.`,
        },
        { status: 400 }
      );
    }

    console.log(`[Import] Processing file: ${file.name}, size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);

    // Read file content with error handling
    let fileContent: string;
    try {
      fileContent = await file.text();
      // fileName is already declared at the top of the function, just update it
      fileName = file.name;
      
      console.log(`[Import] File read successfully, content length: ${fileContent.length} characters`);
      
      if (!fileContent || fileContent.trim().length === 0) {
        return NextResponse.json(
          {
            status: "error",
            error: "CSV file is empty",
          },
          { status: 400 }
        );
      }
    } catch (readError) {
      console.error("[Import] Error reading file:", readError);
      const errorMessage = readError instanceof Error ? readError.message : "Unknown error";
      if (errorMessage.includes("too large") || errorMessage.includes("size")) {
        return NextResponse.json(
          {
            status: "error",
            error: "File too large",
            details: `The file is too large to process. Please split it into smaller files (max ${(MAX_FILE_SIZE / 1024 / 1024).toFixed(0)}MB).`,
          },
          { status: 400 }
        );
      }
      return NextResponse.json(
        {
          status: "error",
          error: "Failed to read CSV file",
          details: errorMessage,
        },
        { status: 400 }
      );
    }

    // Parse CSV
    let csvData: string[][];
    try {
      csvData = parseCSV(fileContent);
      if (csvData.length === 0) {
        return NextResponse.json(
          {
            status: "error",
            error: "CSV file is empty or invalid",
            details: "No data rows found in the CSV file",
          },
          { status: 400 }
        );
      }
    } catch (parseError) {
      console.error("[Import] Error parsing CSV:", parseError);
      return NextResponse.json(
        {
          status: "error",
          error: "Failed to parse CSV file",
          details: parseError instanceof Error ? parseError.message : "Unknown parsing error",
        },
        { status: 400 }
      );
    }

    // Get parser for the exchange
    const parser = ExchangeCSVParser.getParser(exchange);
    if (!parser) {
      return NextResponse.json(
        {
          status: "error",
          error: `Unsupported exchange: ${exchange}`,
        },
        { status: 400 }
      );
    }

    // Parse transactions from CSV with comprehensive error handling
    logBuffer.log(`[Import] Parsing ${csvData.length - 1} rows from CSV...`);
    logBuffer.log(`[Import] CSV headers (${csvData[0]?.length || 0} columns):`, csvData[0]);
    let parsedTransactions;
    try {
      // Wrap parser.parse in try-catch to catch any unexpected errors
      parsedTransactions = parser.parse(csvData);
      logBuffer.log(`[Import] Parsed ${parsedTransactions.length} transactions from ${csvData.length - 1} rows`);
      
      // Log breakdown of transaction types
      const typeCounts: Record<string, number> = {};
      parsedTransactions.forEach(tx => {
        const type = tx.type || "unknown";
        typeCounts[type] = (typeCounts[type] || 0) + 1;
      });
      logBuffer.log(`[Import] Transaction types:`, typeCounts);
      
      if (parsedTransactions.length === 0 && csvData.length > 1) {
        // If we have rows but parsed 0 transactions, it's likely a format issue
        console.warn(`[Import] Warning: Parsed 0 transactions from ${csvData.length - 1} rows. This might indicate a format mismatch.`);
        console.warn(`[Import] CSV Headers:`, csvData[0]);
        console.warn(`[Import] First data row sample:`, csvData[1]?.slice(0, 13));
        
        return NextResponse.json(
          {
            status: "error",
            error: "No valid transactions found in CSV",
            details: `The CSV file has ${csvData.length - 1} rows but no valid transactions were parsed. This usually means the column format doesn't match. Headers found: ${csvData[0].join(", ")}. Please check the server logs for more details.`,
            headers: csvData[0],
            firstRowSample: csvData[1]?.slice(0, 13) || [],
          },
          { status: 400 }
        );
      }
    } catch (parseError) {
      console.error("[Import] Error parsing CSV:", parseError);
      console.error("[Import] Parse error stack:", parseError instanceof Error ? parseError.stack : "No stack");
      const errorMessage = parseError instanceof Error ? parseError.message : "Unknown parsing error";
      
      // Return detailed error with CSV info for debugging
      return NextResponse.json(
        {
          status: "error",
          error: "Failed to parse CSV file",
          details: errorMessage.length > 500 ? errorMessage.substring(0, 500) + "..." : errorMessage,
          headers: csvData?.[0] || [],
          rowCount: csvData?.length || 0,
        },
        { 
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }
    
    if (parsedTransactions.length === 0) {
      return NextResponse.json(
        {
          status: "error",
          error: "No valid transactions found in CSV",
          details: "Please check that your CSV file has the correct format and required columns.",
        },
        { status: 400 }
      );
    }

    // Store transactions in database using batch operations for better performance
    logBuffer.log(`[Import] Starting to save ${parsedTransactions.length} transactions to database...`);
    let added = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Prepare transaction data for batch insert
    const transactionsToCreate: Prisma.TransactionCreateInput[] = [];
    const batchSize = 1000; // Increased batch size for better performance with large files

    logBuffer.log(`[Import] Processing ${parsedTransactions.length} transactions in batches of ${batchSize}...`);

    for (let i = 0; i < parsedTransactions.length; i += batchSize) {
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(parsedTransactions.length / batchSize);
      const progressPercent = Math.min(90, Math.floor((i / parsedTransactions.length) * 90)); // 0-90% for processing
      logBuffer.log(`[Import] Processing batch ${batchNumber} of ${totalBatches} (${progressPercent}% progress)...`);
      const batch = parsedTransactions.slice(i, i + batchSize);
      
      // Skip duplicate checking for large imports to improve performance
      // The createMany with skipDuplicates will handle duplicates
      const existingKeys = new Set<string>();

      // Filter out existing transactions and prepare new ones
      for (const tx of batch) {
        const key = `${tx.tx_timestamp.toISOString()}_${tx.amount_value}_${tx.asset_symbol}`;
        
        if (existingKeys.has(key)) {
          skipped++;
          continue;
        }

        // Categorize the transaction
        const categorized = categorizeTransactionData({
          type: tx.type,
          notes: tx.notes,
          value_usd: tx.value_usd,
          asset_symbol: tx.asset_symbol,
          incoming_asset_symbol: tx.incoming_asset_symbol,
          subtype: tx.subtype,
        });

        // Log notes for first few transactions to debug
        if (i < 5 && (tx.type === "Sell" || tx.type === "sell")) {
          logBuffer.log(`[Import] Transaction ${i + 1}: type=${tx.type}, notes=${tx.notes ? tx.notes.substring(0, 200) : "null"}, hasNotes=${!!tx.notes}`);
        }

        transactionsToCreate.push({
          type: categorized.type,
          subtype: categorized.subtype,
          status: tx.status || "confirmed",
          source: exchange,
          source_type: "csv_import",
          asset_symbol: tx.asset_symbol,
          asset_address: tx.asset_address || null,
          asset_chain: tx.asset_chain || null,
          amount_value: tx.amount_value,
          price_per_unit: tx.price_per_unit || null,
          value_usd: tx.value_usd,
          fee_usd: tx.fee_usd || null,
          wallet_address: tx.wallet_address || null,
          counterparty_address: tx.counterparty_address || null,
          tx_hash: tx.tx_hash || null,
          chain: tx.chain || null,
          block_number: tx.block_number || null,
          explorer_url: tx.explorer_url || null,
          tx_timestamp: tx.tx_timestamp,
          identified: categorized.identified, // Auto-identified if categorized
          notes: tx.notes || null, // Preserve notes from parser - CRITICAL for cost basis
          // Swap fields
          incoming_asset_symbol: tx.incoming_asset_symbol || null,
          incoming_amount_value: tx.incoming_amount_value || null,
          incoming_value_usd: tx.incoming_value_usd || null,
        });
      }

      // Batch insert transactions (clear the array after each batch to save memory)
      if (transactionsToCreate.length > 0) {
        try {
          // Convert to Prisma.TransactionCreateManyInput format
          const createManyData: Prisma.TransactionCreateManyInput[] = transactionsToCreate.map((data) => ({
            type: data.type as string,
            subtype: data.subtype as string | null,
            status: data.status as string,
            source: data.source as string | null,
            source_type: data.source_type as string | null,
            asset_symbol: data.asset_symbol as string,
            asset_address: data.asset_address as string | null,
            asset_chain: data.asset_chain as string | null,
            amount_value: data.amount_value as any,
            price_per_unit: data.price_per_unit as any,
            value_usd: data.value_usd as any,
            fee_usd: data.fee_usd as any,
            wallet_address: data.wallet_address as string | null,
            counterparty_address: data.counterparty_address as string | null,
            tx_hash: data.tx_hash as string | null,
            chain: data.chain as string | null,
            block_number: data.block_number as any,
            explorer_url: data.explorer_url as string | null,
            tx_timestamp: data.tx_timestamp as Date,
            identified: data.identified as boolean,
            notes: data.notes as string | null,
            incoming_asset_symbol: data.incoming_asset_symbol as string | null,
            incoming_amount_value: data.incoming_amount_value as any,
            incoming_value_usd: data.incoming_value_usd as any,
          }));

          // Use createMany with skipDuplicates for better performance
          const result = await prisma.transaction.createMany({
            data: createManyData,
            skipDuplicates: true, // Skip duplicates instead of erroring
          });
          added += result.count;
          logBuffer.log(`[Import] Batch inserted ${result.count} transactions (${added} total added so far)`);
          transactionsToCreate.length = 0; // Clear the array
        } catch (error) {
          // If batch fails, try individual inserts as fallback
          console.warn("[Import] Batch insert failed, trying individual inserts:", error);
          for (const data of transactionsToCreate) {
            try {
              await prisma.transaction.create({ data });
              added++;
            } catch (individualError) {
              // Check if it's a duplicate error
              if (individualError instanceof Error && individualError.message.includes("Unique constraint")) {
                skipped++;
              } else {
                const errorMsg = `Error saving transaction: ${individualError instanceof Error ? individualError.message : "Unknown error"}`;
                console.error(errorMsg, data);
                errors.push(errorMsg);
              }
            }
          }
          transactionsToCreate.length = 0;
        }
      }
    }

    logBuffer.log(`[Import] ===== IMPORT COMPLETE =====`);
    logBuffer.log(`[Import] Completed: ${added} added, ${skipped} skipped, ${errors.length} errors`);
    console.log(`[Import] Completed: ${added} added, ${skipped} skipped, ${errors.length} errors`);
    
    // Count transactions with notes
    const transactionsWithNotes = parsedTransactions.filter(t => t.notes && t.notes.trim()).length;
    logBuffer.log(`[Import] Transactions with notes: ${transactionsWithNotes} out of ${parsedTransactions.length}`);
    if (transactionsWithNotes === 0 && parsedTransactions.length > 0) {
      logBuffer.error(`[Import] WARNING: NO TRANSACTIONS HAVE NOTES! This will cause tax calculation to fail!`);
    }

    // Create or update exchange record
    const exchangeName = exchange.charAt(0).toUpperCase() + exchange.slice(1);
    const existingExchange = await prisma.exchange.findFirst({
      where: {
        userId: user.id,
        name: exchangeName,
      },
    });

    if (existingExchange) {
      await prisma.exchange.update({
        where: { id: existingExchange.id },
        data: { updatedAt: new Date() },
      });
    } else {
      await prisma.exchange.create({
        data: {
          name: exchangeName,
          userId: user.id,
        },
      });
    }

    return NextResponse.json({
      status: "success",
      message: `Imported ${parsedTransactions.length} transactions from ${fileName}`,
      transactionsAdded: added,
      transactionsSkipped: skipped,
      totalTransactions: parsedTransactions.length,
      errors: errors.length > 0 ? errors : undefined,
      source: exchange,
      fileName: fileName,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Import Transactions API] Unhandled error:", error);
    console.error("[Import Transactions API] Error stack:", error instanceof Error ? error.stack : "No stack trace");
    
    // Capture error in Sentry
    try {
      Sentry.captureException(error, {
        tags: {
          endpoint: "/api/transactions/import",
        },
        extra: {
          exchange,
          fileName,
        },
      });
    } catch (sentryError) {
      console.error("[Import] Failed to capture error in Sentry:", sentryError);
    }

    // Ensure we always return valid JSON, even on error
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    const isDatabaseError = errorMessage.includes("Can't reach database") || 
                           errorMessage.includes("P1001") ||
                           errorMessage.includes("connection") ||
                           errorMessage.includes("timeout");

    // Always return valid JSON response
    const errorResponse = {
      status: "error" as const,
      error: "Failed to import transactions",
      details: isDatabaseError 
        ? "Database connection failed. Please check your DATABASE_URL in .env file."
        : errorMessage.length > 500 
          ? errorMessage.substring(0, 500) + "..."
          : errorMessage,
      ...(process.env.NODE_ENV === "development" && errorStack ? { stack: errorStack.substring(0, 1000) } : {}),
    };

    try {
      return NextResponse.json(
        errorResponse,
        { 
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": JSON.stringify(errorResponse).length.toString(),
          },
        }
      );
    } catch (jsonError) {
      // Ultimate fallback - return plain text if JSON fails
      console.error("[Import Transactions API] Failed to create JSON error response:", jsonError);
      return new NextResponse(
        `{"status":"error","error":"Failed to import transactions","details":"An internal error occurred"}`,
        { 
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }
  } finally {
    try {
      await prisma.$disconnect();
    } catch (disconnectError) {
      console.error("[Import] Error disconnecting Prisma:", disconnectError);
    }
  }
}

// Helper function to get Coinbase user from tokens
async function getCoinbaseUserFromTokens(
  tokensCookie: string
): Promise<CoinbaseUser | null> {
  try {
    const { getCoinbaseUser, isTokenExpired, refreshAccessToken } =
      await import("@/lib/coinbase");
    const tokens = JSON.parse(tokensCookie);

    let accessToken = tokens.access_token;

    // Refresh token if expired
    if (isTokenExpired(tokens)) {
      console.log("[Import Transactions API] Access token expired, refreshing");
      const newTokens = await refreshAccessToken(tokens.refresh_token);
      accessToken = newTokens.access_token;
    }

    return await getCoinbaseUser(accessToken);
  } catch (error) {
    console.error("[Import Transactions API] Error getting user from tokens:", error);
    return null;
  }
}
