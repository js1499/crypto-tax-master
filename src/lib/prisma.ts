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
  datasourceUrl: appendConnectionLimit(process.env.DATABASE_URL),
});

/**
 * Append connection pool params to the DATABASE_URL if not already set.
 * Serverless functions behind a connection pooler (Supabase/PgBouncer)
 * should keep a small pool. pool_timeout gives queries more time to
 * acquire a connection under load.
 */
function appendConnectionLimit(url: string | undefined): string | undefined {
  if (!url) return url;
  if (url.includes("connection_limit")) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}connection_limit=5&pool_timeout=30`;
}

// In development, store the instance globally to prevent
// creating new instances on hot reloads
if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

export default prisma;
