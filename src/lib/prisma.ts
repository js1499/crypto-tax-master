import { PrismaClient } from "@prisma/client";

// Declare global type for Prisma in development
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * Prisma Client Singleton
 *
 * In serverless environments (like Vercel), each request can create a new
 * instance of the application. Without a singleton pattern, this leads to:
 * - Multiple database connection pools
 * - Connection pool exhaustion under load
 * - Performance degradation
 *
 * This singleton ensures:
 * - One PrismaClient instance per serverless function
 * - Connection reuse across requests in development
 * - Proper connection management in production
 */
const prisma = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === "development"
    ? ["query", "error", "warn"]
    : ["error"],
});

// In development, store the instance globally to prevent
// creating new instances on hot reloads
if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

export default prisma;
