const Redis = require("ioredis");
const { createTransporter, sendWithRetry } = require("./emails/sendEmail");

class RedisCacheManager {
    constructor(options = {}) {
        this.redis = null;
        this.isConnected = false;
        this.connectPromise = null;

        this.redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
        this.defaultTTL = options.defaultTTL || 600;
        this.ttlJitterPercent = options.ttlJitterPercent ?? 0.1;
        this.invalidationBatchSize = options.invalidationBatchSize || 250;

        this.lastEmailSentAt = 0;
        this.emailCooldownMs = 5 * 60 * 60 * 1000; // 5 hours
        this.lastAlertSignature = null;
    }

    // -------------------------------------
    // CONNECT
    // -------------------------------------
    async connect() {
        if (this.isReady()) return true;
        if (this.connectPromise) return this.connectPromise;

        if (!this.redis) {
            this.redis = new Redis(this.redisUrl, {
                lazyConnect: true,
                retryStrategy(times) {
                    return Math.min(times * 200, 2000);
                },
                maxRetriesPerRequest: 1,
                enableReadyCheck: true,
                enableOfflineQueue: false
            });

            this.redis.on("ready", () => {
                console.log("✅ Redis ready");
                this.isConnected = true;
            });

            this.redis.on("connect", () => {
                console.log("🔗 Redis connected");
            });

            this.redis.on("error", async (err) => {
                console.error("❌ Redis error:", err.name, err.message);
                this.isConnected = false;

                await this.sendAlert(
                    "Redis Error",
                    `redis-error:${err.name}:${err.message}`,
                    `Redis error occurred: ${err.message}`
                );
            });

            this.redis.on("end", async () => {
                console.warn(`⚠️ Redis connection closed: ${this.redisUrl}`);
                this.isConnected = false;
            });
        }

        this.connectPromise = (async () => {
            try {
                await this.redis.connect();
                return true;
            } catch (err) {
                console.error("⛔ Redis connect failed:", err.message);
                this.isConnected = false;
                return false;
            } finally {
                this.connectPromise = null;
            }
        })();

        return this.connectPromise;
    }

    // -------------------------------------
    // DISCONNECT
    // -------------------------------------
    async disconnect() {
        if (!this.redis) return;
        try {
            if (this.isReady()) {
                await this.redis.quit();
                console.log("✅ Redis disconnected");
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
    // EMAIL ALERT WRAPPER
    // -------------------------------------
    async sendAlert(subject, signature, message) {

        if (process.env.NODE_ENV !== 'production') return;
        const now = Date.now();

        // prevent spamming
        if (
            this.lastAlertSignature === signature &&
            now - this.lastEmailSentAt < this.emailCooldownMs
        ) {
            console.log("⏳ Email alert suppressed (cooldown)");
            return;
        }

        const transporter = createTransporter();
        const mailOptions = {
            from: `"QuizBlog Rwanda" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER,
            subject,
            text: message
        };

        this.lastEmailSentAt = now;
        this.lastAlertSignature = signature;
        try {
            await sendWithRetry(transporter, mailOptions);
        } catch (err) {
            console.error("❌ Failed to send Redis alert email:", err.message);
        }
    }

    isReady() {
        return this.redis && this.isConnected && this.redis.status === "ready";
    }

    normalizeTTL(ttl = this.defaultTTL) {
        const baseTTL = Number.isFinite(ttl) ? Math.floor(ttl) : this.defaultTTL;

        if (baseTTL <= 0) return 0;

        const jitter = Math.max(1, Math.floor(baseTTL * this.ttlJitterPercent));
        const randomized = baseTTL + Math.floor(Math.random() * ((jitter * 2) + 1)) - jitter;

        return Math.max(1, randomized);
    }

    async getEntry(key) {
        if (!this.isReady()) {
            return { hit: false, value: null };
        }

        try {
            const raw = await this.redis.get(key);

            if (raw === null) {
                return { hit: false, value: null };
            }

            return { hit: true, value: JSON.parse(raw) };
        } catch (err) {
            console.error(`Redis GET error for key "${key}":`, err.message);
            return { hit: false, value: null };
        }
    }

    // -------------------------------------
    // CACHE OPERATIONS WITH ALERT FALLBACK
    // -------------------------------------
    async get(key) {
        const entry = await this.getEntry(key);
        return entry.hit ? entry.value : null;
    }

    async set(key, value, ttl = this.defaultTTL) {
        if (!this.isReady()) return false;
        try {
            const json = JSON.stringify(value);
            const normalizedTTL = this.normalizeTTL(ttl);

            if (normalizedTTL > 0) await this.redis.setex(key, normalizedTTL, json);
            else await this.redis.set(key, json);
            return true;
        } catch (err) {
            console.error(`Redis SET error for key "${key}":`, err.message);
            return false;
        }
    }

    async del(key) {
        if (!this.isReady()) return false;
        try {
            await this.redis.del(key);
            return true;
        } catch (err) {
            console.error(`Redis DEL error for key "${key}":`, err.message);
            return false;
        }
    }

    async exists(key) {
        if (!this.isReady()) return false;
        try {
            return (await this.redis.exists(key)) === 1;
        } catch (err) {
            console.error(`Redis EXISTS error for key "${key}":`, err.message);
            return false;
        }
    }

    async expire(key, ttl) {
        if (!this.isReady()) return false;
        try {
            await this.redis.expire(key, ttl);
            return true;
        } catch (err) {
            console.error(`Redis EXPIRE error for key "${key}":`, err.message);
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

    async scan(pattern = "*", count = 500) {
        if (!this.isReady()) return [];

        let cursor = "0";
        const keys = [];

        try {
            do {
                const [nextCursor, batch] = await this.redis.scan(
                    cursor,
                    "MATCH",
                    pattern,
                    "COUNT",
                    count
                );
                cursor = nextCursor;
                keys.push(...batch);
            } while (cursor !== "0");

            return keys;
        } catch (err) {
            console.error("Redis SCAN error:", err.message);
            return [];
        }
    }

    async flush() {
        if (!this.isReady()) return false;
        try {
            await this.redis.flushdb();
            return true;
        } catch (err) {
            console.error("Redis FLUSH error:", err.message);
            return false;
        }
    }

    async getStats(options = {}) {
        if (!this.isReady()) return null;

        const { includeKeys = false, pattern = "*" } = options;

        try {
            const info = await this.redis.info();
            const keyCount = await this.redis.dbsize();
            const keys = includeKeys ? await this.scan(pattern) : undefined;

            const parsedInfo = info
                .split("\n")
                .filter((l) => l.includes(":"))
                .reduce((acc, line) => {
                    const [k, v] = line.split(":");
                    acc[k.trim()] = v.trim();
                    return acc;
                }, {});

            return { connected: this.isConnected, keyCount, keys, info: parsedInfo };
        } catch (err) {
            console.error("Redis stats error:", err.message);
            return null;
        }
    }

    async invalidatePattern(pattern) {
        if (!this.isReady()) return false;
        try {
            let cursor = "0";
            let deleted = 0;

            do {
                const [nextCursor, batch] = await this.redis.scan(
                    cursor,
                    "MATCH",
                    pattern,
                    "COUNT",
                    this.invalidationBatchSize
                );
                cursor = nextCursor;

                for (let i = 0; i < batch.length; i += this.invalidationBatchSize) {
                    const keyBatch = batch.slice(i, i + this.invalidationBatchSize);

                    if (keyBatch.length === 0) continue;

                    await this.redis.del(...keyBatch);
                    deleted += keyBatch.length;
                }
            } while (cursor !== "0");

            if (deleted > 0) {
                console.log(`🗑  Deleted ${deleted} keys for pattern "${pattern}"`);
            }
            return true;
        } catch (err) {
            console.error("Redis invalidatePattern error:", err.message);
            return false;
        }
    }
}

module.exports = RedisCacheManager;
