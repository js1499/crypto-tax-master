import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse, rateLimitByUser } from "@/lib/rate-limit";

const SCHEMA_CONTEXT = `
You have access to a PostgreSQL database with a "transactions" table. Here is the schema:

CREATE TABLE transactions (
  id                     SERIAL PRIMARY KEY,
  type                   VARCHAR(50),        -- e.g. SWAP, TRANSFER_IN, TRANSFER_OUT, COMPRESSED_NFT_MINT, INITIALIZE_ACCOUNT, TOKEN_MINT, UNKNOWN, buy, sell, income, etc.
  subtype                VARCHAR(50),        -- nullable
  status                 VARCHAR(30) DEFAULT 'pending', -- confirmed, completed, pending, failed
  source                 VARCHAR(100),       -- e.g. JUPITER, RAYDIUM, ORCA, Coinbase, Binance, csv_import
  source_type            VARCHAR(30),        -- helius, csv_import, exchange_api
  asset_symbol           VARCHAR(50),        -- e.g. SOL, USDC, ETH, BTC, FWOG, JUP, BONK
  asset_address          VARCHAR(255),       -- token mint address (nullable)
  asset_chain            VARCHAR(30),        -- e.g. solana, ethereum
  amount_value           DECIMAL(30,15),     -- amount of the asset
  price_per_unit         DECIMAL(30,15),     -- USD price per unit (nullable)
  value_usd              DECIMAL(30,15),     -- total USD value
  fee_usd                DECIMAL(30,15),     -- fee in USD (nullable)
  incoming_asset_symbol  VARCHAR(50),        -- for swaps: the asset received (nullable)
  incoming_amount_value  DECIMAL(30,15),     -- for swaps: amount received (nullable)
  incoming_value_usd     DECIMAL(30,15),     -- for swaps: USD value received (nullable)
  wallet_address         VARCHAR(100),       -- user's wallet address (nullable for CSV imports)
  counterparty_address   VARCHAR(100),       -- other party's address (nullable)
  tx_hash                VARCHAR(255) UNIQUE,-- transaction hash (nullable)
  chain                  VARCHAR(30),        -- blockchain (solana, ethereum, etc.)
  block_number           BIGINT,             -- (nullable)
  tx_timestamp           TIMESTAMPTZ,        -- when the transaction occurred
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ,
  identified             BOOLEAN DEFAULT false, -- whether the transaction has been reviewed/categorized
  notes                  TEXT,               -- user notes (nullable)
  cost_basis_usd         DECIMAL(30,15),     -- computed cost basis (nullable)
  gain_loss_usd          DECIMAL(30,15),     -- computed gain/loss (nullable)
  is_income              BOOLEAN DEFAULT false -- whether this is an income event
);

Key notes:
- For swaps, the outgoing asset is in asset_symbol/amount_value and the incoming asset is in incoming_asset_symbol/incoming_amount_value
- gain_loss_usd contains the realized gain or loss for the transaction (positive = gain, negative = loss, null = not computed)
- value_usd is the USD value of the primary asset
- Dates are in tx_timestamp (timestamptz)
- Common types: SWAP, TRANSFER_IN, TRANSFER_OUT, buy, sell
- Common sources: JUPITER, RAYDIUM, ORCA (DEXes), Coinbase, Binance (exchanges)
`;

const BLOCKED_KEYWORDS = [
  "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE",
  "GRANT", "REVOKE", "EXEC", "EXECUTE", "INTO", "SET ", "MERGE",
  "REPLACE", "CALL", "COPY", "LOCK", "UNLOCK", "VACUUM", "REINDEX",
];

function isSafeQuery(sql: string): boolean {
  const upper = sql.toUpperCase().trim();
  if (!upper.startsWith("SELECT")) return false;
  for (const keyword of BLOCKED_KEYWORDS) {
    // Check for keyword as a standalone word (not part of another word)
    const regex = new RegExp(`\\b${keyword.trim()}\\b`, "i");
    if (regex.test(upper) && keyword.trim() !== "SET") continue; // SET is ok in some contexts
    if (keyword.trim() === "SET " && upper.includes("SET ")) return false;
    if (keyword.trim() !== "SET " && regex.test(upper)) return false;
  }
  // Block semicolons (prevent multi-statement)
  if (sql.includes(";") && sql.indexOf(";") < sql.length - 1) return false;
  return true;
}

// Simpler safety check
function validateQuery(sql: string): { safe: boolean; reason?: string } {
  const trimmed = sql.trim().replace(/;$/, "");
  const upper = trimmed.toUpperCase();

  if (!upper.startsWith("SELECT")) {
    return { safe: false, reason: "Only SELECT queries are allowed." };
  }

  const dangerous = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE", "GRANT", "REVOKE"];
  for (const kw of dangerous) {
    if (new RegExp(`\\b${kw}\\b`).test(upper)) {
      return { safe: false, reason: `Query contains forbidden keyword: ${kw}` };
    }
  }

  return { safe: true };
}

export async function POST(request: NextRequest) {
  try {
    const rateLimitResult = rateLimitAPI(request, 20);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(rateLimitResult.remaining, rateLimitResult.reset);
    }

    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userRateLimit = rateLimitByUser(user.id, 10); // 10 questions per minute
    if (!userRateLimit.success) {
      return createRateLimitResponse(userRateLimit.remaining, userRateLimit.reset);
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI features not configured. Add ANTHROPIC_API_KEY to environment." },
        { status: 503 },
      );
    }

    const { question, history } = await request.json();
    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    // Get user's wallet addresses for scoping queries
    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });
    const walletAddresses = userWithWallets?.wallets.map((w) => w.address) || [];

    const userExchanges = await prisma.exchange.findMany({
      where: { userId: user.id },
      select: { name: true },
    });
    const exchangeNames = userExchanges.map((e) => e.name);

    // Build the ownership WHERE clause the AI must use
    const ownershipClauses: string[] = [];
    if (walletAddresses.length > 0) {
      ownershipClauses.push(
        `wallet_address IN (${walletAddresses.map((a) => `'${a.replace(/'/g, "''")}'`).join(", ")})`
      );
    }
    ownershipClauses.push(`(source_type = 'csv_import' AND wallet_address IS NULL)`);
    if (exchangeNames.length > 0) {
      ownershipClauses.push(
        `(source_type = 'exchange_api' AND source IN (${exchangeNames.map((n) => `'${n.replace(/'/g, "''")}'`).join(", ")}))`
      );
    }
    const ownershipFilter = ownershipClauses.join(" OR ");

    const anthropic = new Anthropic({ apiKey });

    // Build conversation messages
    const messages: Anthropic.MessageParam[] = [];

    // Include conversation history (last 10 messages)
    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-10)) {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    messages.push({ role: "user", content: question });

    // Step 1: Generate SQL query
    const sqlResponse = await anthropic.messages.create({
      model: "claude-opus-4-20250514",
      max_tokens: 1024,
      system: `${SCHEMA_CONTEXT}

You are a SQL expert for a crypto tax application. The user will ask questions about their transaction data.

CRITICAL SECURITY RULES:
1. ONLY generate SELECT queries. Never generate INSERT, UPDATE, DELETE, or any mutation.
2. ALWAYS include this ownership filter in your WHERE clause: (${ownershipFilter})
3. LIMIT results to 100 rows max.
4. Use ROUND() for decimal values to 2 decimal places.
5. Cast DECIMAL fields to NUMERIC before aggregating: e.g. SUM(value_usd::numeric)

Respond with ONLY the SQL query, nothing else. No markdown, no explanation, just the raw SQL.
If the question cannot be answered with a SQL query, respond with exactly: NO_QUERY_NEEDED
If you need to provide a text-only answer, respond with: NO_QUERY_NEEDED`,
      messages,
    });

    const sqlText = (sqlResponse.content[0] as Anthropic.TextBlock).text.trim();

    let queryResult: any[] | null = null;
    let sqlUsed: string | null = null;

    if (sqlText !== "NO_QUERY_NEEDED") {
      // Clean up the SQL (remove markdown fences if present)
      let cleanSql = sqlText.replace(/^```sql?\n?/i, "").replace(/\n?```$/i, "").trim();
      // Remove trailing semicolons
      cleanSql = cleanSql.replace(/;$/, "");

      // Validate safety
      const validation = validateQuery(cleanSql);
      if (!validation.safe) {
        return NextResponse.json({
          answer: `I can't run that query: ${validation.reason}`,
          sql: cleanSql,
          error: validation.reason,
        });
      }

      sqlUsed = cleanSql;

      // Execute query
      try {
        queryResult = await prisma.$queryRawUnsafe(cleanSql);
        // Serialize BigInt values
        queryResult = JSON.parse(
          JSON.stringify(queryResult, (_, v) => (typeof v === "bigint" ? v.toString() : v))
        );
        // Limit to 100 rows
        if (Array.isArray(queryResult) && queryResult.length > 100) {
          queryResult = queryResult.slice(0, 100);
        }
      } catch (dbError) {
        const errMsg = dbError instanceof Error ? dbError.message : "Query failed";
        return NextResponse.json({
          answer: `The query failed to execute: ${errMsg}. Let me know if you'd like to rephrase your question.`,
          sql: cleanSql,
          error: errMsg,
        });
      }
    }

    // Step 2: Generate natural language answer
    const answerMessages: Anthropic.MessageParam[] = [...messages];

    if (queryResult !== null) {
      answerMessages.push({
        role: "assistant",
        content: `I ran this SQL query:\n${sqlUsed}\n\nResults:\n${JSON.stringify(queryResult, null, 2)}`,
      });
      answerMessages.push({
        role: "user",
        content: "Now provide a clear, concise natural language answer based on those results. Format numbers nicely (USD with $ and commas, percentages, etc). If relevant, mention the number of results. Be conversational but precise.",
      });
    } else {
      answerMessages.push({
        role: "user",
        content: "Answer this question about crypto transactions conversationally. You don't need a SQL query for this one.",
      });
    }

    const answerResponse = await anthropic.messages.create({
      model: "claude-opus-4-20250514",
      max_tokens: 2048,
      system: "You are a helpful crypto tax assistant. Provide clear, concise answers about the user's transaction data. Use markdown formatting for readability. Be conversational but precise with numbers.",
      messages: answerMessages,
    });

    const answer = (answerResponse.content[0] as Anthropic.TextBlock).text;

    return NextResponse.json({
      answer,
      sql: sqlUsed,
      rowCount: queryResult ? queryResult.length : null,
    });
  } catch (error) {
    console.error("[Tax AI API] Error:", error);
    return NextResponse.json(
      { error: "Failed to process question", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
