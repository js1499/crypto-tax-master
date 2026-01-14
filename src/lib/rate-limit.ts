import { LRUCache } from "lru-cache";
import { NextRequest } from "next/server";

/**
 * Rate limiting configuration
 */
interface RateLimitOptions {
  interval: number; // Time window in milliseconds
  uniqueTokenPerInterval: number; // Max unique tokens per interval
}

/**
 * Rate limiter using LRU cache
 * Tracks requests per identifier (IP, user ID, etc.)
 */
class RateLimiter {
  private cache: LRUCache<string, number[]>;

  constructor(options: RateLimitOptions) {
    this.cache = new LRUCache({
      max: options.uniqueTokenPerInterval,
      ttl: options.interval,
    });
  }

  /**
   * Check if a request should be rate limited
   * @param identifier - Unique identifier (IP address, user ID, etc.)
   * @param limit - Maximum number of requests allowed
   * @returns Object with `success` boolean and `remaining` requests
   */
  check(identifier: string, limit: number): {
    success: boolean;
    remaining: number;
    reset: number;
  } {
    const now = Date.now();
    const windowStart = now - (this.cache.ttl || 60000);

    // Get or create request timestamps for this identifier
    const requests = this.cache.get(identifier) || [];
    
    // Filter out requests outside the current window
    const validRequests = requests.filter((timestamp) => timestamp > windowStart);
    
    // Check if limit is exceeded
    if (validRequests.length >= limit) {
      // Update cache with current requests
      this.cache.set(identifier, validRequests);
      
      return {
        success: false,
        remaining: 0,
        reset: Math.min(...validRequests) + (this.cache.ttl || 60000),
      };
    }

    // Add current request
    validRequests.push(now);
    this.cache.set(identifier, validRequests);

    return {
      success: true,
      remaining: limit - validRequests.length,
      reset: now + (this.cache.ttl || 60000),
    };
  }
}

// Create rate limiters for different endpoints
const generalLimiter = new RateLimiter({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500, // Track up to 500 unique IPs
});

const authLimiter = new RateLimiter({
  interval: 15 * 60 * 1000, // 15 minutes
  uniqueTokenPerInterval: 500,
});

const apiLimiter = new RateLimiter({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 1000,
});

/**
 * Get client identifier from request (IP address)
 */
function getIdentifier(request: NextRequest): string {
  // Try to get IP from various headers (for proxies/load balancers)
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  
  const ip = forwarded?.split(",")[0]?.trim() || 
             realIp || 
             cfConnectingIp || 
             request.ip || 
             "unknown";
  
  return ip;
}

/**
 * Rate limit middleware for general API routes
 * @param request - Next.js request object
 * @param limit - Maximum requests per minute (default: 60)
 */
export function rateLimit(
  request: NextRequest,
  limit: number = 60
): {
  success: boolean;
  remaining: number;
  reset: number;
} {
  const identifier = getIdentifier(request);
  return generalLimiter.check(identifier, limit);
}

/**
 * Rate limit middleware for authentication routes
 * Stricter limits to prevent brute force attacks
 * @param request - Next.js request object
 * @param limit - Maximum requests per 15 minutes (default: 5)
 */
export function rateLimitAuth(
  request: NextRequest,
  limit: number = 5
): {
  success: boolean;
  remaining: number;
  reset: number;
} {
  const identifier = getIdentifier(request);
  return authLimiter.check(identifier, limit);
}

/**
 * Rate limit middleware for API routes
 * @param request - Next.js request object
 * @param limit - Maximum requests per minute (default: 100)
 */
export function rateLimitAPI(
  request: NextRequest,
  limit: number = 100
): {
  success: boolean;
  remaining: number;
  reset: number;
} {
  const identifier = getIdentifier(request);
  return apiLimiter.check(identifier, limit);
}

/**
 * Rate limit by user ID (for authenticated requests)
 * @param userId - User ID
 * @param limit - Maximum requests per minute (default: 100)
 */
export function rateLimitByUser(
  userId: string,
  limit: number = 100
): {
  success: boolean;
  remaining: number;
  reset: number;
} {
  return generalLimiter.check(`user:${userId}`, limit);
}

/**
 * Create rate limit response
 */
export function createRateLimitResponse(
  remaining: number,
  reset: number
): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests",
      message: "Rate limit exceeded. Please try again later.",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "X-RateLimit-Limit": "60",
        "X-RateLimit-Remaining": remaining.toString(),
        "X-RateLimit-Reset": new Date(reset).toISOString(),
        "Retry-After": Math.ceil((reset - Date.now()) / 1000).toString(),
      },
    }
  );
}
