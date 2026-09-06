/**
 * @file lib/redis.ts
 * @description Upstash Redis client configuration and utility helpers for distributed locking,
 * caching, and route-level rate limiting in the Kandypack logistics platform.
 *
 * Owned by Member 5 (Cross-cutting infrastructure).
 * Follows system architecture rules from Docs/03_architecture.md §10.
 */

import { Redis } from "@upstash/redis";

/**
 * Lazy-initialized Upstash Redis client singleton.
 * Configured via environment variables:
 * - UPSTASH_REDIS_REST_URL
 * - UPSTASH_REDIS_REST_TOKEN
 */
let redisClient: Redis | null = null;

/**
 * Retrieves or initializes the shared Upstash Redis client instance.
 *
 * @returns {Redis | null} The Redis client instance, or null if environment credentials are not configured.
 */
export function getRedisClient(): Redis | null {
  if (redisClient) {
    return redisClient;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[Redis] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is missing. Redis operations will run in no-op/fallback mode."
      );
    }
    return null;
  }

  redisClient = new Redis({
    url,
    token,
  });

  return redisClient;
}

/**
 * Standard prefix namespacing for keys in Redis to avoid cross-module collisions.
 */
export const REDIS_KEYS = {
  /** Lock for train trip capacity booking (trip_id) */
  LOCK_TRIP_CAPACITY: (tripId: number | string) => `lock:trip:${tripId}`,
  /** Lock for driver scheduling conflict check (driver_id) */
  LOCK_DRIVER_SCHEDULE: (driverId: number | string) => `lock:driver:${driverId}`,
  /** Lock for assistant scheduling conflict check (assistant_id) */
  LOCK_ASSISTANT_SCHEDULE: (assistantId: number | string) => `lock:assistant:${assistantId}`,
  /** Lock for truck assignment conflict check (truck_id) */
  LOCK_TRUCK_SCHEDULE: (truckId: number | string) => `lock:truck:${truckId}`,
  /** Cache key for dashboard summary statistics */
  CACHE_DASHBOARD_SUMMARY: (role: string, storeId: number | string = "global") =>
    `cache:dashboard:summary:${role}:${storeId}`,
  /** Cache key for heavy reporting queries */
  CACHE_REPORT: (reportType: string, filterHash: string) =>
    `cache:report:${reportType}:${filterHash}`,
  /** Rate limit counter key */
  RATE_LIMIT: (action: string, identifier: string) =>
    `ratelimit:${action}:${identifier}`,
} as const;

/* =========================================================================
   1. DISTRIBUTED LOCK HELPERS
   Used by place_order() and schedule_truck_delivery() flows to guard against
   race conditions (belt-and-braces alongside MySQL row-level locks).
   ========================================================================= */

/**
 * Interface representing the result of a lock acquisition attempt.
 */
export interface LockResult {
  /** Whether the lock was successfully obtained */
  acquired: boolean;
  /** Unique lock token used to ensure only the holder releases the lock */
  lockToken: string;
  /** The Redis key used for the lock */
  key: string;
}

/**
 * Attempts to acquire an atomic distributed lock in Redis using SET NX EX.
 *
 * @param {string} key - Unique resource lock key (e.g. `lock:trip:102`).
 * @param {number} [ttlSeconds=10] - Time-to-live in seconds before the lock auto-expires (defaults to 10s).
 * @param {string} [customToken] - Optional unique token; if omitted, a cryptographically random token is generated.
 * @returns {Promise<LockResult>} Object indicating if the lock was acquired and the associated lock token.
 */
export async function acquireLock(
  key: string,
  ttlSeconds: number = 10,
  customToken?: string
): Promise<LockResult> {
  const redis = getRedisClient();
  const lockToken = customToken || crypto.randomUUID();

  // If Redis is not configured (e.g. local offline dev), allow execution with fallback warning
  if (!redis) {
    return { acquired: true, lockToken, key };
  }

  try {
    // "NX": set only if not exists; "EX": set expiration in seconds
    const response = await redis.set(key, lockToken, {
      nx: true,
      ex: ttlSeconds,
    });

    const acquired = response === "OK";
    return { acquired, lockToken, key };
  } catch (error) {
    console.error(`[Redis Lock] Failed to acquire lock for key "${key}":`, error);
    // Fail-safe: if Redis errors out, report non-acquired to prevent unverified concurrent execution
    return { acquired: false, lockToken, key };
  }
}

/**
 * Releases a previously acquired distributed lock.
 * Ensures that a client only deletes its own lock by verifying the lock token.
 *
 * @param {string} key - The lock key to release.
 * @param {string} lockToken - The unique token obtained when acquiring the lock.
 * @returns {Promise<boolean>} True if the lock was released, false otherwise.
 */
export async function releaseLock(key: string, lockToken: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) {
    return true;
  }

  try {
    // Atomic check-and-delete via Lua script to avoid deleting another process's lock if TTL expired
    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await redis.eval(luaScript, [key], [lockToken]);
    return result === 1;
  } catch (error) {
    console.error(`[Redis Lock] Failed to release lock for key "${key}":`, error);
    return false;
  }
}

/**
 * Higher-order helper that wraps an asynchronous critical section in a distributed lock.
 * Automatically acquires the lock before execution and releases it upon completion or error.
 *
 * @template T
 * @param {string} key - Lock resource key.
 * @param {() => Promise<T>} criticalSection - Async function to execute while holding the lock.
 * @param {object} [options] - Lock options.
 * @param {number} [options.ttlSeconds=10] - TTL in seconds for the lock.
 * @param {number} [options.maxRetries=0] - Number of retry attempts if lock is currently busy.
 * @param {number} [options.retryDelayMs=200] - Delay in milliseconds between retry attempts.
 * @returns {Promise<T>} The result of the critical section.
 * @throws {Error} Throws if lock could not be acquired or if the critical section throws.
 */
export async function withLock<T>(
  key: string,
  criticalSection: () => Promise<T>,
  options: { ttlSeconds?: number; maxRetries?: number; retryDelayMs?: number } = {}
): Promise<T> {
  const ttlSeconds = options.ttlSeconds ?? 10;
  const maxRetries = options.maxRetries ?? 0;
  const retryDelayMs = options.retryDelayMs ?? 200;

  let attempts = 0;
  let lockResult: LockResult = { acquired: false, lockToken: "", key };

  while (attempts <= maxRetries) {
    lockResult = await acquireLock(key, ttlSeconds);
    if (lockResult.acquired) {
      break;
    }
    attempts++;
    if (attempts <= maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  if (!lockResult.acquired) {
    throw new Error(
      `Resource is currently locked by another concurrent process. Please try again shortly. (Key: ${key})`
    );
  }

  try {
    return await criticalSection();
  } finally {
    await releaseLock(key, lockResult.lockToken);
  }
}

/* =========================================================================
   2. CACHING HELPERS
   Used for dashboard summary KPI counts (30-60s TTL) and aggregate report queries.
   ========================================================================= */

/**
 * Cache-aside helper: checks Redis for a cached value; if missing, runs the fetcher,
 * writes the result to Redis with the specified TTL, and returns the data.
 *
 * @template T
 * @param {string} key - Redis cache key.
 * @param {number} ttlSeconds - Cache expiration duration in seconds.
 * @param {() => Promise<T>} fetcher - Async function returning fresh data on cache miss.
 * @returns {Promise<T>} Cached or freshly fetched data.
 */
export async function getOrSetCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const redis = getRedisClient();

  // If Redis is not available, bypass cache and fetch directly
  if (!redis) {
    return fetcher();
  }

  try {
    const cachedData = await redis.get<T>(key);
    if (cachedData !== null && cachedData !== undefined) {
      return cachedData;
    }
  } catch (error) {
    console.warn(`[Redis Cache] Error reading cache for key "${key}":`, error);
  }

  // Execute database/underlying query
  const freshData = await fetcher();

  try {
    if (freshData !== null && freshData !== undefined) {
      await redis.set(key, freshData, { ex: ttlSeconds });
    }
  } catch (error) {
    console.warn(`[Redis Cache] Error writing cache for key "${key}":`, error);
  }

  return freshData;
}

/**
 * Explicitly invalidates a cache key.
 *
 * @param {string} key - Redis key to delete.
 * @returns {Promise<boolean>} True if key was deleted.
 */
export async function invalidateCache(key: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return true;

  try {
    const deletedCount = await redis.del(key);
    return deletedCount > 0;
  } catch (error) {
    console.error(`[Redis Cache] Failed to invalidate key "${key}":`, error);
    return false;
  }
}

/* =========================================================================
   3. RATE LIMITING HELPER
   Sliding window / fixed-window rate limiter for sensitive endpoints:
   - POST /api/auth/login
   - POST /api/orders
   - POST /api/truck-schedules
   - POST /api/reports/:type/export/pdf
   ========================================================================= */

/**
 * Result structure returned by rate-limiting checks.
 */
export interface RateLimitResult {
  /** Whether the request is within the permitted rate limit */
  allowed: boolean;
  /** Maximum number of allowed requests in the time window */
  limit: number;
  /** Number of remaining allowed requests in the current window */
  remaining: number;
  /** Epoch timestamp in milliseconds when the limit window resets */
  resetTimeMs: number;
}

/**
 * Evaluates whether an action from a client identifier (e.g. IP or user ID) exceeds the rate limit.
 *
 * @param {string} action - Name of the protected endpoint/action (e.g. "auth_login", "order_create").
 * @param {string} identifier - Unique client identifier (e.g. client IP or user_id).
 * @param {number} limit - Maximum number of requests allowed within the window.
 * @param {number} windowSeconds - Duration of the rate limiting window in seconds.
 * @returns {Promise<RateLimitResult>} Evaluation of rate limit status.
 */
export async function checkRateLimit(
  action: string,
  identifier: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const redis = getRedisClient();
  const now = Date.now();
  const resetTimeMs = now + windowSeconds * 1000;

  // If Redis is not configured, allow request in local dev
  if (!redis) {
    return {
      allowed: true,
      limit,
      remaining: limit - 1,
      resetTimeMs,
    };
  }

  const key = REDIS_KEYS.RATE_LIMIT(action, identifier);

  try {
    // Atomic increment
    const currentCount = await redis.incr(key);

    // If this is the first hit in the window, set the expiration
    if (currentCount === 1) {
      await redis.expire(key, windowSeconds);
    }

    const remaining = Math.max(0, limit - currentCount);
    const allowed = currentCount <= limit;

    return {
      allowed,
      limit,
      remaining,
      resetTimeMs,
    };
  } catch (error) {
    console.error(`[Redis RateLimit] Error checking rate limit for ${action}:${identifier}:`, error);
    // On unexpected Redis outage, fail open to avoid rejecting valid user requests
    return {
      allowed: true,
      limit,
      remaining: 1,
      resetTimeMs,
    };
  }
}
