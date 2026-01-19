import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { calculateTaxReport } from "@/lib/tax-calculator";
import { generateForm8949PDF } from "@/lib/form8949-pdf";
import { getCurrentUser } from "@/lib/auth";
import { rateLimitAPI, createRateLimitResponse } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

const prisma = new PrismaClient();

/**
 * GET /api/tax-reports/form8949?year=2023
 * Generate and download Form 8949 PDF for a given tax year
 */
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = rateLimitAPI(request, 10); // 10 PDFs per minute
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());

    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "Invalid year parameter" },
        { status: 400 }
      );
    }

    // Get user authentication via custom session token
    let user;
    try {
      const sessionCookie = request.cookies.get("session_token")?.value;

      user = await getCurrentUser(sessionCookie);
    } catch (authError) {
      console.error("[Form 8949 API] Auth error:", authError);
      const errorMessage = authError instanceof Error ? authError.message : "Unknown error";
      if (errorMessage.includes("Can't reach database") || errorMessage.includes("P1001")) {
        return NextResponse.json(
          {
            error: "Database connection failed",
            details: "Please check your database connection.",
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: "Authentication failed", details: errorMessage },
        { status: 401 }
      );
    }

    if (!user) {
      console.error("[Form 8949 API] No user found - session may be expired or invalid");
      return NextResponse.json(
        { 
          error: "Not authenticated",
          details: "Please log in to generate tax reports."
        },
        { status: 401 }
      );
    }

    // Get user with wallets
    const userWithWallets = await prisma.user.findUnique({
      where: { id: user.id },
      include: { wallets: true },
    });

    if (!userWithWallets) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get user's wallet addresses
    const walletAddresses = userWithWallets.wallets.map((w) => w.address);

    // Get filing status from query params (default to "single")
    const filingStatus = (searchParams.get("filingStatus") || "single") as "single" | "married_joint" | "married_separate" | "head_of_household";
    
    // Calculate tax report
    // Also include CSV-imported transactions
    const report = await calculateTaxReport(
      prisma,
      walletAddresses,
      year,
      "FIFO",
      user.id, // Pass user ID to include CSV imports
      filingStatus
    );

    // Optional: Get taxpayer info from request (for future enhancement)
    const taxpayerName = searchParams.get("name") || user.name || undefined;
    const ssn = searchParams.get("ssn") || undefined; // Should be encrypted in production

    // Generate PDF
    const pdfBuffer = await generateForm8949PDF(
      report.form8949Data,
      year,
      taxpayerName,
      ssn
    );

    // Return PDF as download
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Form8949-${year}.pdf"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("[Form 8949 PDF API] Error:", error);

    // Capture error in Sentry
    Sentry.captureException(error, {
      tags: {
        endpoint: "/api/tax-reports/form8949",
      },
    });

    return NextResponse.json(
      {
        error: "Failed to generate Form 8949 PDF",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
