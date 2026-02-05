import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { decryptApiKey } from "@/lib/exchange-clients";
import axios from "axios";
import crypto from "crypto";
import jwt from "jsonwebtoken";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");

// Generate JWT for Coinbase CDP API
function generateCoinbaseJWT(
  apiKeyName: string,
  privateKey: string,
  method: string,
  host: string,
  apiPath: string
): string {
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString("hex");
  const uri = `${method} ${host}${apiPath}`;

  const payload = {
    sub: apiKeyName,
    iss: "cdp",
    aud: ["cdp_service"],
    nbf: now,
    exp: now + 120,
    uri: uri,
  };

  return jwt.sign(payload, privateKey, {
    algorithm: "ES256",
    header: { alg: "ES256", typ: "JWT", kid: apiKeyName, nonce },
  });
}

function formatPrivateKey(privateKey: string): string {
  if (privateKey.includes("-----BEGIN")) {
    return privateKey.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
  }
  const cleanKey = privateKey.replace(/\s+/g, "");
  return `-----BEGIN EC PRIVATE KEY-----\n${cleanKey}\n-----END EC PRIVATE KEY-----`;
}

function createHeaders(apiKeyName: string, privateKey: string, method: string, apiPath: string) {
  const formattedKey = formatPrivateKey(privateKey);
  const token = generateCoinbaseJWT(apiKeyName, formattedKey, method, "api.coinbase.com", apiPath);
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// Escape CSV field
function escapeCSV(value: any): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get Coinbase exchange credentials
    const exchange = await prisma.exchange.findFirst({
      where: { userId: session.user.id, name: "coinbase" },
    });

    if (!exchange?.apiKey || !exchange?.apiSecret) {
      return NextResponse.json({ error: "Coinbase not connected or missing credentials" }, { status: 400 });
    }

    // Decrypt credentials
    const apiKeyName = decryptApiKey(exchange.apiKey, ENCRYPTION_KEY);
    const privateKey = decryptApiKey(exchange.apiSecret, ENCRYPTION_KEY);

    // Collect all raw transactions
    const rawTransactions: any[] = [];

    // Get all accounts with pagination
    let allAccounts: any[] = [];
    let accountsNextUri: string | null = "/v2/accounts";
    let accountPageCount = 0;

    while (accountsNextUri && accountPageCount < 20) {
      accountPageCount++;
      const accountsPath = accountsNextUri.startsWith("http")
        ? new URL(accountsNextUri).pathname + new URL(accountsNextUri).search
        : accountsNextUri;

      const headers = createHeaders(apiKeyName, privateKey, "GET", accountsPath.split("?")[0]);
      const response = await axios.get(
        accountsNextUri.startsWith("http") ? accountsNextUri : `https://api.coinbase.com${accountsPath}`,
        { headers, params: accountsNextUri.includes("?") ? undefined : { limit: 100 } }
      );

      allAccounts = allAccounts.concat(response.data.data || []);
      accountsNextUri = response.data.pagination?.next_uri || null;
    }

    console.log(`[Coinbase Dump] Found ${allAccounts.length} accounts`);

    // Get transactions for each account
    for (const account of allAccounts) {
      let nextUri: string | null = `/v2/accounts/${account.id}/transactions`;
      let pageCount = 0;

      while (nextUri && pageCount < 100) {
        pageCount++;
        const txPath = nextUri.startsWith("http")
          ? new URL(nextUri).pathname + new URL(nextUri).search
          : nextUri;

        const headers = createHeaders(apiKeyName, privateKey, "GET", txPath.split("?")[0]);
        const response = await axios.get(
          nextUri.startsWith("http") ? nextUri : `https://api.coinbase.com${txPath}`,
          { headers, params: nextUri.includes("?") ? undefined : { limit: 100, order: "asc" } }
        );

        const txs = response.data.data || [];
        for (const tx of txs) {
          rawTransactions.push({
            // Account info
            account_id: account.id,
            account_name: account.name,
            account_currency: account.currency?.code,
            // Transaction fields - exactly as Coinbase returns them
            tx_id: tx.id,
            tx_type: tx.type,
            tx_status: tx.status,
            tx_created_at: tx.created_at,
            tx_updated_at: tx.updated_at,
            // Amount
            amount: tx.amount?.amount,
            amount_currency: tx.amount?.currency,
            // Native amount (USD value)
            native_amount: tx.native_amount?.amount,
            native_amount_currency: tx.native_amount?.currency,
            // Description
            description: tx.description,
            // Network info (if available)
            network_status: tx.network?.status,
            network_hash: tx.network?.hash,
            network_name: tx.network?.name,
            // Details (varies by tx type)
            details_title: tx.details?.title,
            details_subtitle: tx.details?.subtitle,
            details_header: tx.details?.header,
            details_health: tx.details?.health,
            // To/From addresses (if available)
            to_address: tx.to?.address,
            from_address: tx.from?.address,
            // Buy/Sell specific
            buy_id: tx.buy?.id,
            sell_id: tx.sell?.id,
            // Trade specific
            trade_id: tx.trade?.id,
            // Raw JSON for reference
            raw_json: JSON.stringify(tx),
          });
        }

        nextUri = response.data.pagination?.next_uri || null;
      }
    }

    console.log(`[Coinbase Dump] Collected ${rawTransactions.length} raw transactions`);

    // Generate CSV content
    const headers = [
      "account_id", "account_name", "account_currency",
      "tx_id", "tx_type", "tx_status", "tx_created_at", "tx_updated_at",
      "amount", "amount_currency", "native_amount", "native_amount_currency",
      "description", "network_status", "network_hash", "network_name",
      "details_title", "details_subtitle", "details_header", "details_health",
      "to_address", "from_address", "buy_id", "sell_id", "trade_id", "raw_json"
    ];

    const csvRows = [headers.join(",")];
    for (const tx of rawTransactions) {
      const row = headers.map(h => escapeCSV(tx[h]));
      csvRows.push(row.join(","));
    }

    const csvContent = csvRows.join("\n");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `coinbase-raw-dump-${timestamp}.csv`;

    console.log(`[Coinbase Dump] Returning ${rawTransactions.length} transactions as CSV download`);

    // Return as downloadable CSV file
    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[Coinbase Dump] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to dump Coinbase data" },
      { status: 500 }
    );
  }
}
