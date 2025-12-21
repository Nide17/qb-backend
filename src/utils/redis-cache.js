const Redis = require("ioredis");
const { createTransporter, sendWithRetry } = require("./emails/sendEmail");

class RedisCacheManager {
    constructor(options = {}) {
        this.redis = null;
        this.isConnected = false;

        this.redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
        this.defaultTTL = options.defaultTTL || 600;

        this.lastEmailSentAt = 0;
        this.emailCooldownMs = 5 * 60 * 1000; // 5 minutes
    }

    // -------------------------------------
    // CONNECT
    // -------------------------------------
    async connect() {
        if (this.isReady()) return true;

        try {
            this.redis = new Redis(this.redisUrl, {
                retryStrategy(times) {
                    return Math.min(times * 200, 2000);
                },
                maxRetriesPerRequest: null,
                enableReadyCheck: true
            });

            this.redis.once("ready", () => {
                console.log("✅ Redis ready");
                this.isConnected = true;
            });

            this.redis.on("connect", () => {
                console.log("🔗 Redis connected");
            });

            this.redis.on("error", async (err) => {
                // console.error("❌ Redis error:", err.name, err.message);
                this.isConnected = false;

                await this.sendAlert(
                    "Redis Error",
                    `Redis error occurred: ${err.message}`
                );
            });

            this.redis.on("end", async () => {
                console.warn("⚠️ Redis connection closed");
                this.isConnected = false;

                await this.sendAlert(
                    "Redis Connection Closed",
                    "Redis connection ended unexpectedly."
                );
            });

            await this.redis.connect();
            return true;

        } catch (err) {
            console.error("Redis connect failed:", err.message);
            this.isConnected = false;

            await this.sendAlert(
                "Redis Failed to Connect",
                `Could not connect to Redis: ${err.message}`
            );

            return false;
        }
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
    async sendAlert(subject, message) {

        if (process.env.NODE_ENV !== 'production') return;
        const now = Date.now();

        // prevent spamming
        if (now - this.lastEmailSentAt < this.emailCooldownMs) {
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
        try {
            await sendWithRetry(transporter, mailOptions);
        } catch (err) {
            console.error("❌ Failed to send Redis alert email:", err.message);
        }
    }

    isReady() {
        return this.redis && this.isConnected && this.redis.status === "ready";
    }

    // -------------------------------------
    // CACHE OPERATIONS WITH ALERT FALLBACK
    // -------------------------------------
    async get(key) {
        if (!this.isReady()) {
            await this.sendAlert("Redis Not Ready", "GET operation failed");
            return null;
        }
        try {
            const raw = await this.redis.get(key);
            return raw ? JSON.parse(raw) : null;
        } catch (err) {
            console.error("Redis GET error:", err.message);
            return null;
        }
    }

    async set(key, value, ttl = this.defaultTTL) {
        if (!this.isReady()) {
            await this.sendAlert("Redis Not Ready", "SET operation failed");
            return false;
        }
        try {
            const json = JSON.stringify(value);
            if (ttl > 0) await this.redis.setex(key, ttl, json);
            else await this.redis.set(key, json);
            return true;
        } catch (err) {
            console.error("Redis SET error:", err.message);
            return false;
        }
    }

    async del(key) {
        if (!this.isReady()) {
            await this.sendAlert("Redis Not Ready", "DEL operation failed");
            return false;
        }
        try {
            await this.redis.del(key);
            return true;
        } catch (err) {
            console.error("Redis DEL error:", err.message);
            return false;
        }
    }

    async exists(key) {
        if (!this.isReady()) {
            await this.sendAlert("Redis Not Ready", "EXISTS operation failed");
            return false;
        }
        try {
            return (await this.redis.exists(key)) === 1;
        } catch (err) {
            console.error("Redis EXISTS error:", err.message);
            return false;
        }
    }

    async expire(key, ttl) {
        if (!this.isReady()) {
            await this.sendAlert("Redis Not Ready", "EXPIRE operation failed");
            return false;
        }
        try {
            await this.redis.expire(key, ttl);
            return true;
        } catch (err) {
            console.error("Redis EXPIRE error:", err.message);
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

    async getStats() {
        if (!this.isReady()) return null;

        try {
            const info = await this.redis.info();
            const keyCount = await this.redis.dbsize();
            const keys = await this.scan();

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
            const keys = await this.scan(pattern);
            if (keys.length > 0) {
                await this.redis.del(...keys);
                console.log(`🗑  Deleted ${keys.length} keys for pattern "${pattern}"`);
            }
            return true;
        } catch (err) {
            console.error("Redis invalidatePattern error:", err.message);
            return false;
        }
    }
}

module.exports = RedisCacheManager;
