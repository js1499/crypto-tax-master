import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import crypto from "crypto";

/**
 * POST /api/auth/forgot-password
 * Sends a password reset email with a time-limited token.
 * Body: { email: string }
 */
export async function POST(request: NextRequest) {
  const { email } = await request.json();

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  // Always return success to prevent email enumeration
  const successResponse = NextResponse.json({ status: "success" });

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, email: true, name: true },
    });

    if (!user) return successResponse;

    // Generate reset token (expires in 1 hour)
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store token in VerificationToken table (reusing NextAuth's table)
    await prisma.verificationToken.create({
      data: {
        identifier: user.email!,
        token,
        expires,
      },
    });

    // Send email via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.error("[Forgot Password] RESEND_API_KEY not configured");
      return successResponse;
    }

    const { Resend } = await import("resend");
    const resend = new Resend(resendKey);

    const origin = request.headers.get("origin") || "https://crypto-tax-master.vercel.app";
    const resetUrl = `${origin}/reset-password?token=${token}&email=${encodeURIComponent(user.email!)}`;

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "Glide <noreply@resend.dev>",
      to: user.email!,
      subject: "Reset your Glide password",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Reset your password</h2>
          <p>Hi${user.name ? ` ${user.name}` : ""},</p>
          <p>We received a request to reset your password. Click the button below to choose a new one:</p>
          <a href="${resetUrl}" style="display: inline-block; background: #2563EB; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin: 16px 0;">Reset Password</a>
          <p style="color: #6B7280; font-size: 14px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    });

    return successResponse;
  } catch (error) {
    console.error("[Forgot Password] Error:", error);
    return successResponse; // Don't leak errors
  }
}
