import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

/**
 * POST /api/auth/reset-password
 * Validates token and updates the user's password.
 * Body: { token: string, email: string, password: string }
 */
export async function POST(request: NextRequest) {
  const { token, email, password } = await request.json();

  if (!token || !email || !password) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  try {
    // Find the verification token
    const verificationToken = await prisma.verificationToken.findFirst({
      where: {
        identifier: email.toLowerCase().trim(),
        token,
        expires: { gt: new Date() }, // Not expired
      },
    });

    if (!verificationToken) {
      return NextResponse.json(
        { error: "Invalid or expired reset link. Please request a new one." },
        { status: 400 },
      );
    }

    // Hash the new password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update user's password
    await prisma.user.update({
      where: { email: email.toLowerCase().trim() },
      data: { passwordHash },
    });

    // Delete the used token
    await prisma.verificationToken.delete({
      where: {
        identifier_token: {
          identifier: verificationToken.identifier,
          token: verificationToken.token,
        },
      },
    });

    return NextResponse.json({ status: "success" });
  } catch (error) {
    console.error("[Reset Password] Error:", error);
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 });
  }
}
