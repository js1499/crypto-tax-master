import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";

/**
 * POST /api/ads/purchase-fired   body: { sessionId: "cs_..." }
 *
 * Records that the Google Ads Purchase conversion for this Stripe Checkout Session
 * has fired client-side, so a later success-page refresh/reopen does NOT re-fire.
 * Called from <PurchaseConversion> only AFTER gtag confirms the send. Idempotent and
 * fully fail-safe — it never errors the client and never affects payment.
 */
export async function POST(request: NextRequest) {
  try {
    // Require an authenticated user (the buyer is logged in on return from Stripe).
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const body = await request
      .json()
      .catch(() => ({}) as Record<string, unknown>);
    const sessionId =
      typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    if (!sessionId || !sessionId.startsWith("cs_")) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    try {
      await prisma.adsPurchaseConversion.create({ data: { sessionId } });
    } catch (e) {
      // P2002 = already recorded (idempotent, expected). Any other code is a real
      // error worth surfacing — log the CODE only, never PII.
      const code = (e as { code?: string })?.code;
      if (code !== "P2002") {
        console.error("[ads/purchase-fired] record failed:", code || "unknown");
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    // Fail-safe: never throw to the client.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
