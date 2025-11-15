const Redis = require("ioredis");

class RedisCacheManager {
    constructor(options = {}) {
        this.redis = null;
        this.isConnected = false;
        this.redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
        this.defaultTTL = options.defaultTTL || 600; // seconds
        this.retryDelay = options.retryDelay || 30000;
        this.maxRetries = options.maxRetries || 1;
    }

    isReady() {
        return this.redis && this.isConnected && this.redis.status === "ready";
    }

    async connect() {
        if (this.isReady()) return true;

        try {
            // keep your simple URL usage, but add a few resilience options
            this.redis = new Redis(process.env.REDIS_URL, {
                // allow ioredis to retry on transient errors (small exponential backoff)
                retryStrategy(times) {
                    return Math.min(times * 200, 2000); // ms
                },
                // don't fail a request immediately if reconnecting
                maxRetriesPerRequest: null,
                enableReadyCheck: true
            });

            // prefer 'ready' for when the client is actually usable
            this.redis.once('ready', () => {
                console.log('✅ Redis ready');
                this.isConnected = true;
            });

            this.redis.on('connect', () => {
                console.log('🔗 Redis socket connected (TCP)');
            });

            this.redis.on('error', (err) => {
                console.error('❌ Redis error:', err && err.message ? err.message : err);
                this.isConnected = false;
            });

            this.redis.on('end', () => {
                console.warn('⚠️ Redis connection closed');
                this.isConnected = false;
            });

            // explicit connect call is fine — ioredis will attempt to use the URL (including rediss://)
            await this.redis.connect();

            return true;
        } catch (err) {
            this.isConnected = false;
            console.error('Redis connect failed:', err && err.message ? err.message : err);
            return false;
        }
    }

    async disconnect() {
        if (!this.redis) return;

        try {
            if (this.isReady()) {
                await this.redis.quit();
                console.log("✅ Redis disconnected gracefully");
            } else {
                this.redis.disconnect();
            }
        } catch (err) {
            console.error("Redis disconnect error:", err.message);
            this.redis.disconnect();
        } finally {
            this.isConnected = false;
        }
    }

    // -------------------------------------
    // Basic cache operations
    // -------------------------------------

    async get(key) {
        if (!this.isReady()) return null;

        try {
            const raw = await this.redis.get(key);
            return raw ? JSON.parse(raw) : null;
        } catch (err) {
            console.error("Redis get error:", err.message);
            return null;
        }
    }

    async set(key, value, ttl = this.defaultTTL) {
        if (!this.isReady()) return false;

        try {
            const json = JSON.stringify(value);
            if (ttl > 0) {
                await this.redis.setex(key, ttl, json);
            } else {
                await this.redis.set(key, json);
            }
            return true;
        } catch (err) {
            console.error("Redis set error:", err.message);
            return false;
        }
    }

    async del(key) {
        if (!this.isReady()) return false;

        try {
            await this.redis.del(key);
            return true;
        } catch (err) {
            console.error("Redis del error:", err.message);
            return false;
        }
    }

    async exists(key) {
        if (!this.isReady()) return false;

        try {
            return (await this.redis.exists(key)) === 1;
        } catch (err) {
            console.error("Redis exists error:", err.message);
            return false;
        }
    }

    async expire(key, ttl) {
        if (!this.isReady()) return false;

        try {
            await this.redis.expire(key, ttl);
            return true;
        } catch (err) {
            console.error("Redis expire error:", err.message);
            return false;
        }
    }

    async ttl(key) {
        if (!this.isReady()) return -1;

        try {
            return await this.redis.ttl(key);
        } catch (err) {
            console.error("Redis TTL error:", err.message);
            return -1;
        }
    }

    // -------------------------------------
    // Keys — using SCAN instead of KEYS
    // -------------------------------------

    async scan(pattern = "*", count = 500) {
        if (!this.isReady()) return [];

        let cursor = "0";
        const keys = [];

        try {
            do {
                const [nextCursor, batch] = await this.redis.scan(cursor, "MATCH", pattern, "COUNT", count);
                cursor = nextCursor;
                keys.push(...batch);
            } while (cursor !== "0");

            return keys;
        } catch (err) {
            console.error("Redis scan error:", err.message);
            return [];
        }
    }

    async flush() {
        if (!this.isReady()) return false;

        try {
            await this.redis.flushdb();
            return true;
        } catch (err) {
            console.error("Redis flush error:", err.message);
            return false;
        }
    }

    async getStats() {
        if (!this.isReady()) return null;

        try {
            const info = await this.redis.info();
            const keyCount = await this.redis.dbsize();
            const keys = await this.scan();

            const parsedInfo = info
                .split("\n")
                .filter((line) => line.includes(":"))
                .reduce((acc, line) => {
                    const [k, v] = line.split(":");
                    acc[k.trim()] = v.trim();
                    return acc;
                }, {});

            return {
                connected: this.isConnected,
                keyCount,
                keys,
                info: parsedInfo,
            };
        } catch (err) {
            console.error("Redis stats error:", err.message);
            return null;
        }
    }

    // -------------------------------------
    // Cache invalidation
    // -------------------------------------

    async invalidatePattern(pattern) {
        if (!this.isReady()) return false;

        try {
            const keys = await this.scan(pattern);
            if (keys.length > 0) {
                await this.redis.del(...keys);
                console.log(`🗑 Deleted ${keys.length} keys for pattern "${pattern}"`);
            }
            return true;
        } catch (err) {
            console.error("Redis invalidatePattern error:", err.message);
            return false;
        }
    }
}

module.exports = RedisCacheManager;
