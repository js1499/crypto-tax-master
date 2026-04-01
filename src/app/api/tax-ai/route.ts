import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse, rateLimitByUser } from "@/lib/rate-limit";

// ─── Rich schema + domain context ──────────────────────────────────────────

const SCHEMA_CONTEXT = `
You have access to a PostgreSQL database for a crypto tax application.

## Tables

### transactions (main table — this is what you'll query most)
| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL PK | Auto-increment ID |
| type | VARCHAR(50) | Transaction type. Common values: SWAP, TRANSFER_IN, TRANSFER_OUT, COMPRESSED_NFT_MINT, INITIALIZE_ACCOUNT, TOKEN_MINT, UNKNOWN, buy, sell, income |
| subtype | VARCHAR(50) | Optional sub-classification (nullable) |
| status | VARCHAR(30) | confirmed, completed, pending, or failed |
| source | VARCHAR(100) | Where the tx came from: JUPITER, RAYDIUM, ORCA, PHOENIX, LIFINITY (Solana DEXes), Coinbase, Binance, Kraken, Gemini, KuCoin (exchanges), or csv_import |
| source_type | VARCHAR(30) | helius (on-chain via Helius API), csv_import (user CSV upload), exchange_api (exchange sync) |
| asset_symbol | VARCHAR(50) | Primary asset ticker: SOL, USDC, ETH, BTC, FWOG, JUP, BONK, WIF, POPCAT, etc. |
| asset_address | VARCHAR(255) | Token mint/contract address (nullable) |
| asset_chain | VARCHAR(30) | solana, ethereum, bitcoin, etc. |
| amount_value | DECIMAL(30,15) | Amount of the primary asset |
| price_per_unit | DECIMAL(30,15) | USD price per unit at time of tx (nullable) |
| value_usd | DECIMAL(30,15) | Total USD value of primary asset side |
| fee_usd | DECIMAL(30,15) | Transaction fee in USD (nullable) |
| incoming_asset_symbol | VARCHAR(50) | For SWAPs: the asset received (nullable) |
| incoming_amount_value | DECIMAL(30,15) | For SWAPs: amount received (nullable) |
| incoming_value_usd | DECIMAL(30,15) | For SWAPs: USD value of received asset (nullable) |
| wallet_address | VARCHAR(100) | User's wallet address (NULL for CSV imports) |
| counterparty_address | VARCHAR(100) | Other party's address (nullable) |
| tx_hash | VARCHAR(255) UNIQUE | On-chain transaction hash/signature (nullable) |
| chain | VARCHAR(30) | Blockchain: solana, ethereum, bitcoin, etc. |
| block_number | BIGINT | Block number (nullable) |
| tx_timestamp | TIMESTAMPTZ | When the transaction occurred |
| created_at | TIMESTAMPTZ | When the record was created |
| updated_at | TIMESTAMPTZ | Last update time |
| identified | BOOLEAN | Whether the user has reviewed/categorized this transaction |
| notes | TEXT | User-added notes (nullable) |
| cost_basis_usd | DECIMAL(30,15) | Computed cost basis for the asset (nullable — NULL means not yet computed) |
| gain_loss_usd | DECIMAL(30,15) | Realized gain (+) or loss (-). NULL = not computed. 0 = computed as zero. |
| is_income | BOOLEAN | Whether this is a taxable income event (staking reward, airdrop, etc.) |

### wallets (user's connected wallets — READ ONLY context, don't query directly)
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | Wallet ID |
| name | TEXT | Display name |
| address | TEXT | Wallet address (matches transactions.wallet_address) |
| provider | TEXT | "solana", "ethereum", "bitcoin" |
| chains | TEXT | Supported chains (nullable) |
| lastSyncAt | TIMESTAMPTZ | Last sync time (nullable) |

### exchanges (connected exchange accounts — READ ONLY context, don't query directly)
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | Exchange ID |
| name | TEXT | Coinbase, Binance, Kraken, Gemini, KuCoin |
| isConnected | BOOLEAN | Whether currently connected |
| lastSyncAt | TIMESTAMPTZ | Last sync time (nullable) |

## Key domain knowledge

**Swap mechanics**: A SWAP has both outgoing (asset_symbol, amount_value, value_usd) and incoming (incoming_asset_symbol, incoming_amount_value, incoming_value_usd) sides. Example: swapping 1 SOL ($150) for 10,000 BONK ($150).

**Gain/loss**: gain_loss_usd is the realized profit or loss. Positive = gain, negative = loss. Many transactions have NULL (not yet computed). To get P&L, aggregate only non-NULL values.

**Income**: is_income=true means the transaction is taxable as ordinary income (staking rewards, airdrops, mining rewards). The income amount is value_usd.

**Identification**: identified=true means the user has reviewed and categorized the transaction. Unidentified transactions may need attention.

**Common Solana tokens**: SOL (native), USDC (stablecoin), JUP (Jupiter DEX), BONK (memecoin), WIF (memecoin), FWOG (memecoin), POPCAT (memecoin), RAY (Raydium), ORCA, PYTH, W (Wormhole), RENDER, HNT (Helium).

**Common sources**: JUPITER (largest Solana DEX aggregator), RAYDIUM (Solana AMM), ORCA (Solana DEX), PHOENIX (Solana order book), Coinbase/Binance/Kraken/Gemini/KuCoin (centralized exchanges).

**Value/volume**: value_usd represents the USD value of the transaction. For total trading volume, sum value_usd. For swap volume specifically, filter type='SWAP'.

**Fees**: fee_usd is per-transaction. Sum for total fee spend. Solana fees are typically very small ($0.001-0.01), while exchange fees can be 0.1-0.5% of trade value.

**Time**: tx_timestamp is the authoritative date. Use EXTRACT(YEAR FROM tx_timestamp) for yearly aggregation, TO_CHAR(tx_timestamp, 'YYYY-MM') for monthly.

## IMPORTANT SQL notes
- Always cast DECIMAL to NUMERIC before aggregating: SUM(value_usd::numeric), not SUM(value_usd)
- Use ROUND(..., 2) for USD amounts
- Use COALESCE() for nullable fields when aggregating
- LIMIT 100 rows max on all queries
`;

// ─── Query safety ──────────────────────────────────────────────────────────

function validateQuery(sql: string): { safe: boolean; reason?: string } {
  const trimmed = sql.trim().replace(/;$/, "");
  const upper = trimmed.toUpperCase();

  if (!upper.startsWith("SELECT")) {
    return { safe: false, reason: "Only SELECT queries are allowed." };
  }

  const dangerous = [
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE",
    "GRANT", "REVOKE", "COPY", "LOCK", "VACUUM", "UNION",
  ];
  for (const kw of dangerous) {
    if (new RegExp(`\\b${kw}\\b`).test(upper)) {
      return { safe: false, reason: `Query contains forbidden keyword: ${kw}` };
    }
  }

  // Block access to system catalogs
  const systemPatterns = ["INFORMATION_SCHEMA", "PG_CATALOG", "PG_TABLES", "PG_STAT"];
  for (const pattern of systemPatterns) {
    if (upper.includes(pattern)) {
      return { safe: false, reason: `Query references forbidden system object: ${pattern}` };
    }
  }

  // Block multiple statements
  const semiCount = (trimmed.match(/;/g) || []).length;
  if (semiCount > 0) {
    return { safe: false, reason: "Multiple statements not allowed." };
  }

  return { safe: true };
}

/**
 * Wrap the AI-generated query in a CTE that enforces ownership.
 * This is the SERVER-SIDE security gate — no matter what SQL Claude generates,
 * it can only read from the scoped subset of transactions.
 */
function wrapWithOwnershipFilter(
  sql: string,
  ownershipFilter: string,
): string {
  // Replace bare "transactions" table reference with our scoped CTE
  // The CTE pre-filters to only the user's data
  return `
WITH user_transactions AS (
  SELECT * FROM transactions WHERE (${ownershipFilter}) AND status IN ('confirmed', 'completed', 'pending')
)
${sql.replace(/\btransactions\b/gi, "user_transactions")}
  `.trim();
}

// ─── Route handler ─────────────────────────────────────────────────────────

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

    const userRateLimit = rateLimitByUser(user.id, 10);
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

    const { question, history, fileContent, fileName, stream: wantStream } = await request.json();
    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 });
    }

    const fileSummary = fileContent
      ? `\n\nThe user attached a file named "${fileName || "file.csv"}".\nHere are the first 200,000 characters of its contents:\n\`\`\`\n${String(fileContent).slice(0, 200000)}\n\`\`\``
      : "";

    // ── Resolve user's data ownership ──────────────────────────────
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

    // Build SQL ownership filter (used server-side in CTE wrapper)
    const ownershipClauses: string[] = [];
    if (walletAddresses.length > 0) {
      ownershipClauses.push(
        `wallet_address IN (${walletAddresses.map((a) => `'${a.replace(/'/g, "''")}'`).join(", ")})`
      );
    }
    ownershipClauses.push(`(source_type = 'csv_import' AND user_id = '${user.id.replace(/'/g, "''")}')`);

    if (exchangeNames.length > 0) {
      ownershipClauses.push(
        `(source_type = 'exchange_api' AND source IN (${exchangeNames.map((n) => `'${n.replace(/'/g, "''")}'`).join(", ")}))`
      );
    }
    const ownershipFilter = ownershipClauses.join(" OR ");

    // Build user context summary for the AI
    const userContext = `
The user has ${walletAddresses.length} wallet(s)${walletAddresses.length > 0 ? ` on chains including ${[...new Set(userWithWallets?.wallets.map(w => w.provider))].join(", ")}` : ""} and ${exchangeNames.length} exchange(s)${exchangeNames.length > 0 ? ` (${exchangeNames.join(", ")})` : ""}.
`;

    const anthropic = new Anthropic({ apiKey });

    // Build conversation
    const messages: Anthropic.MessageParam[] = [];
    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-10)) {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }
    messages.push({ role: "user", content: question + fileSummary });

    // ── Step 1: Generate SQL ───────────────────────────────────────
    const sqlResponse = await anthropic.messages.create({
      model: "claude-opus-4-20250514",
      max_tokens: 1024,
      system: `${SCHEMA_CONTEXT}
${userContext}

You are a SQL expert for this crypto tax application. Generate a PostgreSQL SELECT query to answer the user's question.

RULES:
1. ONLY generate SELECT queries against the "transactions" table.
2. Do NOT add any ownership/wallet filtering — that is handled automatically by the system.
3. LIMIT results to 100 rows max.
4. Use ROUND() for decimal values to 2 decimal places.
5. Cast DECIMAL fields to NUMERIC before aggregating: e.g. SUM(value_usd::numeric)
6. If the user attached a file and the question is about that file (not the database), respond with: NO_QUERY_NEEDED
7. If the question is general knowledge (not a data query), respond with: NO_QUERY_NEEDED

Respond with ONLY the raw SQL query. No markdown fences, no explanation, no comments.`,
      messages,
    });

    const sqlText = (sqlResponse.content[0] as Anthropic.TextBlock).text.trim();

    let queryResult: any[] | null = null;
    let sqlUsed: string | null = null;

    if (sqlText !== "NO_QUERY_NEEDED") {
      let cleanSql = sqlText
        .replace(/^```sql?\n?/i, "")
        .replace(/\n?```$/i, "")
        .trim()
        .replace(/;$/, "");

      // Validate safety (no mutations)
      const validation = validateQuery(cleanSql);
      if (!validation.safe) {
        return NextResponse.json({
          answer: `I can't run that query: ${validation.reason}`,
          sql: cleanSql,
          error: validation.reason,
        });
      }

      // SERVER-SIDE SECURITY: wrap query in CTE that enforces ownership
      // The AI never sees the real table — only the pre-filtered user_transactions CTE
      const wrappedSql = wrapWithOwnershipFilter(cleanSql, ownershipFilter);
      sqlUsed = cleanSql; // Show the clean version to the user

      try {
        queryResult = await prisma.$queryRawUnsafe(wrappedSql);
        queryResult = JSON.parse(
          JSON.stringify(queryResult, (_, v) => (typeof v === "bigint" ? v.toString() : v))
        );
        if (Array.isArray(queryResult) && queryResult.length > 100) {
          queryResult = queryResult.slice(0, 100);
        }
      } catch (dbError) {
        const errMsg = dbError instanceof Error ? dbError.message : "Query failed";
        return NextResponse.json({
          answer: `The query failed to execute. This can happen with complex queries. Could you rephrase your question?\n\nError: ${errMsg}`,
          sql: cleanSql,
          error: errMsg,
        });
      }
    }

    // ── Step 2: Generate natural language answer ───────────────────
    const answerMessages: Anthropic.MessageParam[] = [...messages];

    if (queryResult !== null) {
      answerMessages.push({
        role: "assistant",
        content: `I queried the database and got these results:\n${JSON.stringify(queryResult, null, 2)}`,
      });
      answerMessages.push({
        role: "user",
        content: "Provide a clear, concise natural language answer based on those results. Format USD with $ and commas, round to 2 decimal places. Use markdown for structure when helpful. Be conversational but precise.",
      });
    } else {
      answerMessages.push({
        role: "user",
        content: "Answer this question conversationally. You don't need a SQL query for this one. If the user attached a file, analyze it directly.",
      });
    }

    const answerSystemPrompt = `You are a helpful crypto tax AI assistant. You help users understand their transaction data, trading activity, gains/losses, and tax implications.
${userContext}

Guidelines:
- Be conversational but precise with numbers
- Format USD with $ and commas, round to 2 decimals
- Use markdown (bold, lists, headers) for readability
- If you spot potential tax issues, flag them
- If data seems incomplete (lots of NULL gain_loss_usd), mention that cost basis may need computing

When returning CSV data, ALWAYS include it as a downloadable file block at the END of your message (never inline rows in text):
\`\`\`csv-download:descriptive-filename.csv
header1,header2
value1,value2
\`\`\`
Use this format whenever: (1) the user asks for data as a download/export, (2) you are reformatting a CSV, (3) you are returning query results with more than 5 rows, or (4) the user uploaded a file and expects transformed output. Do NOT print CSV rows as plain text — always use the csv-download block so the user gets a downloadable file.

When the user asks you to reformat a CSV for import, use these target formats:

**Crypto CSV formats (for /transactions import):**
- Coinbase: Timestamp,Transaction Type,Asset,Quantity Transacted,Spot Price at Transaction,Subtotal,Total (inclusive of fees),Fees,Notes
- Binance: Date(UTC),Pair,Type,Order Amount,AvgTrading Price,Filled,Total,status
- Kraken: txid,refid,time,type,subtype,aclass,asset,amount,fee,balance
- Custom (recommended): Date,Type,Asset,Amount,Price,Value,Notes
  Valid types: Buy, Sell, Swap, Send, Receive, Staking, Reward, Airdrop, Mining, Interest, Yield, Transfer, Bridge, Burn

**Securities CSV format (for /securities/transactions import):**
Required: date,type,symbol,asset_class,quantity,price
Optional: fees,account,account_type,total_amount,lot_id,underlying_symbol,option_type,strike_price,expiration_date,dividend_type,is_covered,is_section_1256,notes
Valid types: BUY, SELL, SELL_SHORT, BUY_TO_COVER, DIVIDEND, DIVIDEND_REINVEST, INTEREST, SPLIT, MERGER, SPINOFF, RETURN_OF_CAPITAL, OPTION_EXERCISE, OPTION_ASSIGNMENT, OPTION_EXPIRATION, RSU_VEST, ESPP_PURCHASE, TRANSFER_IN, TRANSFER_OUT, YEAR_END_FMV
Valid asset_class: STOCK, ETF, MUTUAL_FUND, OPTION, FUTURE, FOREX, BOND, WARRANT
Valid account_type: TAXABLE, IRA_TRADITIONAL, IRA_ROTH, 401K, HSA, 529

When reformatting, always output the full result as a csv-download block. Map the user's columns to the target format. If data is missing, note it and use reasonable defaults (0 for price, empty for notes).`;

    // ── Streaming response ─────────────────────────────────────────
    if (wantStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            // Send metadata first
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ type: "meta", sql: sqlUsed, rowCount: queryResult ? queryResult.length : null })}\n\n`
            ));

            // Stream the answer
            const streamResponse = anthropic.messages.stream({
              model: "claude-opus-4-20250514",
              max_tokens: 4096,
              system: answerSystemPrompt,
              messages: answerMessages,
            });

            let fullText = "";
            for await (const event of streamResponse) {
              if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                fullText += event.delta.text;
                controller.enqueue(encoder.encode(
                  `data: ${JSON.stringify({ type: "text", content: event.delta.text })}\n\n`
                ));
              }
            }

            // Extract file download from complete text
            let answer = fullText;
            let fileDownload: { name: string; content: string } | null = null;
            const csvMatch = fullText.match(/```csv-download:(.+?)\n([\s\S]*?)```/);
            if (csvMatch) {
              fileDownload = { name: csvMatch[1].trim(), content: csvMatch[2].trim() };
              answer = fullText.replace(/```csv-download:.+?\n[\s\S]*?```/, "").trim();
            }

            // Send final event with clean answer
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ type: "done", answer, fileDownload })}\n\n`
            ));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          } catch (err) {
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ type: "error", error: err instanceof Error ? err.message : "Stream failed" })}\n\n`
            ));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // ── Non-streaming fallback ─────────────────────────────────────
    const answerResponse = await anthropic.messages.create({
      model: "claude-opus-4-20250514",
      max_tokens: 4096,
      system: answerSystemPrompt,
      messages: answerMessages,
    });

    const rawAnswer = (answerResponse.content[0] as Anthropic.TextBlock).text;

    let answer = rawAnswer;
    let fileDownload: { name: string; content: string } | null = null;

    const csvMatch = rawAnswer.match(/```csv-download:(.+?)\n([\s\S]*?)```/);
    if (csvMatch) {
      fileDownload = { name: csvMatch[1].trim(), content: csvMatch[2].trim() };
      answer = rawAnswer.replace(/```csv-download:.+?\n[\s\S]*?```/, "").trim();
    }

    return NextResponse.json({
      answer,
      sql: sqlUsed,
      rowCount: queryResult ? queryResult.length : null,
      fileDownload,
    });
  } catch (error) {
    console.error("[Tax AI API] Error:", error);
    return NextResponse.json(
      { error: "Failed to process question", details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : "Unknown error") : "An internal error occurred" },
      { status: 500 },
    );
  }
}
