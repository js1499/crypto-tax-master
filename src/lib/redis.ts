import Redis from "ioredis";

// Redis connection instance (singleton)
let redis: Redis | null = null;
let redisEnabled = false;

/**
 * Initialize Redis connection
 * Returns Redis client if connection successful, null otherwise
 */
export function getRedisClient(): Redis | null {
  // Return existing connection if available
  if (redis && redis.status === "ready") {
    return redis;
  }

  // Check if Redis URL is configured
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    // Redis not configured - app will work without it (graceful degradation)
    if (process.env.NODE_ENV === "development") {
      console.log("[Redis] REDIS_URL not configured, caching disabled");
    }
    return null;
  }

  try {
    // Create Redis connection
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        // Retry with exponential backoff
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError: (err) => {
        const targetError = "READONLY";
        if (err.message.includes(targetError)) {
          // Only reconnect when the error contains "READONLY"
          return true;
        }
        return false;
      },
      enableOfflineQueue: false, // Don't queue commands when disconnected
    });

    // Handle connection events
    redis.on("connect", () => {
      redisEnabled = true;
      console.log("[Redis] Connected successfully");
    });

    redis.on("ready", () => {
      redisEnabled = true;
      console.log("[Redis] Ready to accept commands");
    });

    redis.on("error", (err) => {
      console.error("[Redis] Connection error:", err.message);
      redisEnabled = false;
      // Don't throw - allow app to continue without Redis
    });

    redis.on("close", () => {
      redisEnabled = false;
      console.log("[Redis] Connection closed");
    });

    redis.on("reconnecting", () => {
      console.log("[Redis] Reconnecting...");
    });

    return redis;
  } catch (error) {
    console.error("[Redis] Failed to initialize:", error);
    redisEnabled = false;
    return null;
  }
}

/**
 * Check if Redis is available and enabled
 */
export function isRedisEnabled(): boolean {
  const client = getRedisClient();
  return client !== null && redisEnabled;
}

/**
 * Get value from Redis cache
 * Returns null if Redis is unavailable or key doesn't exist
 */
export async function getCache<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client || !redisEnabled) {
    return null;
  }

  try {
    const value = await client.get(key);
    if (value === null) {
      return null;
    }
    return JSON.parse(value) as T;
  } catch (error) {
    console.error(`[Redis] Error getting cache key ${key}:`, error);
    return null;
  }
}

/**
 * Set value in Redis cache
 * @param key - Cache key
 * @param value - Value to cache (will be JSON stringified)
 * @param ttlSeconds - Time to live in seconds (0 = no expiration, permanent)
 */
export async function setCache(
  key: string,
  value: any,
  ttlSeconds: number = 0
): Promise<boolean> {
  const client = getRedisClient();
  if (!client || !redisEnabled) {
    return false;
  }

  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds > 0) {
      await client.setex(key, ttlSeconds, serialized);
    } else {
      // Permanent cache (no expiration)
      await client.set(key, serialized);
    }
    return true;
  } catch (error) {
    console.error(`[Redis] Error setting cache key ${key}:`, error);
    return false;
  }
}

/**
 * Delete value from Redis cache
 */
export async function deleteCache(key: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client || !redisEnabled) {
    return false;
  }

  try {
    await client.del(key);
    return true;
  } catch (error) {
    console.error(`[Redis] Error deleting cache key ${key}:`, error);
    return false;
  }
}

/**
 * Check if a key exists in cache
 */
export async function existsCache(key: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client || !redisEnabled) {
    return false;
  }

  try {
    const result = await client.exists(key);
    return result === 1;
  } catch (error) {
    console.error(`[Redis] Error checking cache key ${key}:`, error);
    return false;
  }
}

/**
 * Get multiple values from cache
 */
export async function getMultipleCache<T>(keys: string[]): Promise<(T | null)[]> {
  const client = getRedisClient();
  if (!client || !redisEnabled) {
    return keys.map(() => null);
  }

  try {
    const values = await client.mget(...keys);
    return values.map((value) => {
      if (value === null) {
        return null;
      }
      try {
        return JSON.parse(value) as T;
      } catch {
        return null;
      }
    });
  } catch (error) {
    console.error("[Redis] Error getting multiple cache keys:", error);
    return keys.map(() => null);
  }
}

/**
 * Set multiple values in cache
 */
export async function setMultipleCache(
  items: Array<{ key: string; value: any; ttlSeconds?: number }>
): Promise<boolean> {
  const client = getRedisClient();
  if (!client || !redisEnabled) {
    return false;
  }

  try {
    const pipeline = client.pipeline();
    for (const item of items) {
      const serialized = JSON.stringify(item.value);
      if (item.ttlSeconds && item.ttlSeconds > 0) {
        pipeline.setex(item.key, item.ttlSeconds, serialized);
      } else {
        pipeline.set(item.key, serialized);
      }
    }
    await pipeline.exec();
    return true;
  } catch (error) {
    console.error("[Redis] Error setting multiple cache keys:", error);
    return false;
  }
}

/**
 * Close Redis connection (for cleanup)
 */
export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    redisEnabled = false;
  }
}

// Initialize Redis on module load
if (typeof window === "undefined") {
  // Only initialize on server side
  getRedisClient();
}
