import prisma from "@/lib/prisma";

/**
 * Invalidate all cached tax reports for a user.
 * Call this after any transaction mutation (create, update, delete).
 */
export async function invalidateTaxReportCache(userId: string): Promise<void> {
  try {
    await prisma.taxReportCache.deleteMany({
      where: { userId },
    });
  } catch (error) {
    // Non-critical — log and continue
    console.error("[TaxReportCache] Failed to invalidate:", error);
  }
}
