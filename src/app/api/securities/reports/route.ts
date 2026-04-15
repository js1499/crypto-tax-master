import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-helpers";
import { rateLimitAPI, createRateLimitResponse, rateLimitByUser } from "@/lib/rate-limit";
import { generateSecuritiesTaxReport } from "@/lib/securities-report-generator";
import {
  generateRealizedGainsCSV,
  generateWashSaleDetailCSV,
  generateWashSaleCarryForwardCSV,
  generatePermanentlyDisallowedCSV,
  generateDividendSummaryCSV,
  generateSection1256SummaryCSV,
  generateSection475SummaryCSV,
  generateSecuritiesTurboTaxCSV,
} from "@/lib/securities-csv-exports";
import { canAccessTaxYear, getTaxYearAccessMessage, getUserPlan } from "@/lib/plan-limits";

/**
 * GET /api/securities/reports?year=2025&type=realized-gains
 *
 * Generates a CSV export for the requested securities report type.
 *
 * Supported types:
 *   realized-gains         — All closed positions with lot detail
 *   wash-sale-detail       — Every wash sale
 *   carry-forward          — Cross-year wash sales
 *   permanently-disallowed — IRA permanent losses
 *   dividend-summary       — Dividends by payer and type
 *   section-1256           — Section 1256 gains with 60/40 split
 *   section-475            — MTM ordinary gains
 *   turbotax               — TurboTax-compatible format
 */
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 30);
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset,
      );
    }

    // Authenticate
    let user;
    try {
      user = await getCurrentUser(request);
    } catch (authError) {
      console.error("[Securities Reports API] Auth error:", authError);
      const errorMessage = authError instanceof Error ? authError.message : "Unknown error";
      if (errorMessage.includes("Can't reach database") || errorMessage.includes("P1001")) {
        return NextResponse.json(
          { error: "Database connection failed", details: "Please check your database connection." },
          { status: 503 },
        );
      }
      return NextResponse.json(
        { error: "Authentication failed", details: errorMessage },
        { status: 401 },
      );
    }

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated", details: "Please log in to export securities reports." },
        { status: 401 },
      );
    }

    // Per-user rate limiting
    const userRateLimit = rateLimitByUser(user.id, 10);
    if (!userRateLimit.success) {
      return createRateLimitResponse(
        userRateLimit.remaining,
        userRateLimit.reset,
      );
    }

    // Parse params
    const { searchParams } = new URL(request.url);
    const yearStr = searchParams.get("year") || new Date().getFullYear().toString();
    const year = parseInt(yearStr, 10);

    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "Invalid year parameter" },
        { status: 400 },
      );
    }

    const plan = await getUserPlan(user.id);
    if (!plan.features.allReports) {
      return NextResponse.json(
        { error: "Securities report exports require a paid plan." },
        { status: 403 },
      );
    }

    if (!canAccessTaxYear(plan, year)) {
      return NextResponse.json(
        { error: getTaxYearAccessMessage(plan, year) },
        { status: 403 },
      );
    }

    const reportType = searchParams.get("type") || "";

    // Generate the securities tax report
    const report = await generateSecuritiesTaxReport(user.id, year);

    // Route to the appropriate CSV generator
    let csvContent: string;
    let filename: string;

    switch (reportType) {
      case "realized-gains":
        csvContent = generateRealizedGainsCSV(report);
        filename = `Securities-Realized-Gains-${year}.csv`;
        break;
      case "wash-sale-detail":
        csvContent = generateWashSaleDetailCSV(report);
        filename = `Securities-Wash-Sale-Detail-${year}.csv`;
        break;
      case "carry-forward":
        csvContent = generateWashSaleCarryForwardCSV(report);
        filename = `Securities-Wash-Sale-Carry-Forward-${year}.csv`;
        break;
      case "permanently-disallowed":
        csvContent = generatePermanentlyDisallowedCSV(report);
        filename = `Securities-Permanently-Disallowed-${year}.csv`;
        break;
      case "dividend-summary":
        csvContent = generateDividendSummaryCSV(report);
        filename = `Securities-Dividend-Summary-${year}.csv`;
        break;
      case "section-1256":
        csvContent = generateSection1256SummaryCSV(report);
        filename = `Securities-Section-1256-${year}.csv`;
        break;
      case "section-475":
        csvContent = generateSection475SummaryCSV(report);
        filename = `Securities-Section-475-${year}.csv`;
        break;
      case "turbotax":
        csvContent = generateSecuritiesTurboTaxCSV(report);
        filename = `Securities-TurboTax-${year}.csv`;
        break;
      default:
        return NextResponse.json(
          { error: `Unsupported report type: ${reportType}` },
          { status: 400 },
        );
    }

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[Securities Reports API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate securities report",
        details: process.env.NODE_ENV === "development"
          ? (error instanceof Error ? error.message : "Unknown error")
          : "An internal error occurred",
      },
      { status: 500 },
    );
  }
}
