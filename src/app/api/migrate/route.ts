import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";

/**
 * POST /api/migrate
 * 
 * Run Prisma migrations (for Vercel deployment)
 * 
 * SECURITY WARNING: This endpoint should be protected in production!
 * Consider adding authentication or removing this endpoint after initial setup.
 * 
 * Recommended: Use Vercel CLI instead:
 *   vercel env pull .env.production.local
 *   npx prisma migrate deploy
 */
export async function POST(request: NextRequest) {
  // Optional: Add authentication check
  // const user = await getCurrentUser();
  // if (!user || user.email !== 'admin@example.com') {
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // }

  // Optional: Add secret token check
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.MIGRATION_SECRET_TOKEN;
  
  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json(
      { error: "Unauthorized. Set MIGRATION_SECRET_TOKEN in environment variables." },
      { status: 401 }
    );
  }

  try {
    console.log("Starting Prisma migrations...");
    
    // Run Prisma migrations
    execSync("npx prisma migrate deploy", {
      stdio: "inherit",
      env: process.env,
      cwd: process.cwd(),
    });

    console.log("Migrations completed successfully");
    
    return NextResponse.json({
      success: true,
      message: "Database migrations applied successfully",
    });
  } catch (error: any) {
    console.error("Migration failed:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: "Migration failed",
        message: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
