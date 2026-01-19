import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { logBuffer } from "@/lib/log-buffer";

/**
 * GET /api/dev/test-logs
 * Test endpoint to verify log buffer is working
 */
export async function GET(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get("session_token")?.value;

    const user = await getCurrentUser(sessionCookie);
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get stats before writing
    const statsBefore = logBuffer.getStats();
    
    // Write test logs
    const testTimestamp = new Date().toISOString();
    logBuffer.log(`[TEST] Test log message at ${testTimestamp}`);
    logBuffer.warn(`[TEST] Test warning message at ${testTimestamp}`);
    logBuffer.error(`[TEST] Test error message at ${testTimestamp}`);
    logBuffer.info(`[TEST] Test info message at ${testTimestamp}`);

    const statsAfter = logBuffer.getStats();
    const logs = logBuffer.getLogs({ limit: 20 });

    return NextResponse.json({
      status: "success",
      message: "Test logs written",
      testTimestamp,
      statsBefore,
      statsAfter,
      logBufferInstance: logBuffer.constructor.name,
      recentLogs: logs.map(log => ({
        timestamp: log.timestamp.toISOString(),
        level: log.level,
        message: log.message,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
