import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  hashPassword,
  isValidEmail,
  isValidPassword,
} from "@/lib/auth";
import { rateLimitAuth, createRateLimitResponse } from "@/lib/rate-limit";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/auth/register
 * Register a new user with email and password
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting for auth endpoints
    const rateLimitResult = rateLimitAuth(request, 3); // 3 registrations per 15 minutes
    if (!rateLimitResult.success) {
      return createRateLimitResponse(
        rateLimitResult.remaining,
        rateLimitResult.reset
      );
    }
    const body = await request.json();
    const { email, password, name } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate password strength
    const passwordValidation = isValidPassword(password);
    if (!passwordValidation.valid) {
      return NextResponse.json(
        { error: passwordValidation.message },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        passwordHash,
        name: name?.trim() || null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    // Send welcome email (fire-and-forget)
    if (process.env.RESEND_API_KEY) {
      import("resend").then(({ Resend }) => {
        const resend = new Resend(process.env.RESEND_API_KEY);
        resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || "Glide <noreply@resend.dev>",
          to: user.email!,
          subject: "Welcome to Glide",
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
              <h2>Welcome to Glide!</h2>
              <p>Hi${user.name ? ` ${user.name}` : ""},</p>
              <p>Your account has been created. You're ready to start calculating your crypto taxes with precision.</p>
              <p><strong>Here's how to get started:</strong></p>
              <ol>
                <li>Connect your wallets and exchanges</li>
                <li>We'll automatically sync transactions and pull prices</li>
                <li>Download your tax reports (Schedule D, Form 8949, Schedule 1)</li>
              </ol>
              <a href="${process.env.NEXTAUTH_URL || "https://crypto-tax-master.vercel.app"}/accounts" style="display: inline-block; background: #10b981; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500; margin: 16px 0;">Go to Dashboard</a>
              <p style="color: #6B7280; font-size: 14px;">If you have any questions, reach out to our support team.</p>
            </div>
          `,
        }).catch(() => {}); // Don't block registration if email fails
      }).catch(() => {});
    }

    return NextResponse.json(
      {
        message: "User registered successfully",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Register API] Error:", error);
    
    // Capture error in Sentry
    Sentry.captureException(error, {
      tags: {
        endpoint: "/api/auth/register",
      },
    });
    
    return NextResponse.json(
      {
        error: "Failed to register user",
        ...(process.env.NODE_ENV === "development" && {
          details: error instanceof Error ? error.message : "Unknown error",
        }),
      },
      { status: 500 }
    );
  }
}
