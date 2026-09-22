import Redis from 'ioredis';

interface CacheEntry {
  value: string;
  expiresAt: number;
}

// In-memory fallback store
const memoryStore = new Map<string, CacheEntry>();

// Clean up expired in-memory entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (entry.expiresAt < now) {
      memoryStore.delete(key);
    }
  }
}, 60_000);

let redisClient: Redis | null = null;
let isRedisConnected = false;

if (process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      retryStrategy(times) {
        if (times > 3) {
          // Stop retrying after 3 attempts — use in-memory fallback
          return null;
        }
        return Math.min(times * 1000, 3000);
      },
    });

    redisClient.on('connect', () => {
      isRedisConnected = true;
      console.log('[Redis] Connected successfully to Redis server');
    });

    redisClient.on('error', (err) => {
      isRedisConnected = false;
      // Suppress repeated connection logs if running locally without Redis
      if ((err as any).code === 'ECONNREFUSED') {
        // Expected when Redis is not running locally
      } else {
        console.warn('[Redis Warning]:', err.message);
      }
    });

    redisClient.on('close', () => {
      isRedisConnected = false;
    });
  } catch (err: any) {
    console.warn('[Redis] Initialization skipped, using in-memory store:', err.message);
    redisClient = null;
  }
} else {
  console.log('[Redis] No REDIS_URL provided, using in-memory cache/deduplication store.');
}

export const cache = {
  /**
   * Set key with expiry in seconds.
   */
  async setWithExpiry(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (isRedisConnected && redisClient) {
      try {
        await redisClient.setex(key, ttlSeconds, value);
        return;
      } catch {
        // Fall back to memory
      }
    }
    memoryStore.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  },

  /**
   * Set key only if it doesn't already exist (atomic check-and-set).
   * Returns true if key was set, false if key already existed.
   */
  async setIfNotExists(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    if (isRedisConnected && redisClient) {
      try {
        const res = await redisClient.set(key, value, 'EX', ttlSeconds, 'NX');
        return res === 'OK';
      } catch {
        // Fall back to memory
      }
    }

    const now = Date.now();
    const existing = memoryStore.get(key);
    if (existing && existing.expiresAt > now) {
      return false; // Already exists
    }

    memoryStore.set(key, {
      value,
      expiresAt: now + ttlSeconds * 1000,
    });
    return true;
  },

  /**
   * Get value by key.
   */
  async get(key: string): Promise<string | null> {
    if (isRedisConnected && redisClient) {
      try {
        return await redisClient.get(key);
      } catch {
        // Fall back to memory
      }
    }

    const entry = memoryStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      memoryStore.delete(key);
      return null;
    }
    return entry.value;
  },

  /**
   * Check if key exists and is not expired.
   */
  async exists(key: string): Promise<boolean> {
    if (isRedisConnected && redisClient) {
      try {
        const res = await redisClient.exists(key);
        return res === 1;
      } catch {
        // Fall back to memory
      }
    }

    const entry = memoryStore.get(key);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      memoryStore.delete(key);
      return false;
    }
    return true;
  },

  /**
   * Delete a key.
   */
  async del(key: string): Promise<void> {
    if (isRedisConnected && redisClient) {
      try {
        await redisClient.del(key);
      } catch {
        // Fall back to memory
      }
    }
    memoryStore.delete(key);
  },

  /**
   * Check whether Redis is currently connected.
   */
  isConnected(): boolean {
    return isRedisConnected;
  },
};
