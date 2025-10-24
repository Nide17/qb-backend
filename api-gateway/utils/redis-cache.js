const Redis = require('ioredis');

class RedisCacheManager {
    constructor() {
        this.redis = null;
        this.isConnected = false;
        this.defaultTTL = 300; // 5 minutes in seconds
        this.retryDelay = 30000; // 30 seconds
        this.maxRetries = 1;

        // Fallback in-memory cache
        this.memoryCache = new Map();
        this.memoryTTL = new Map();
        this.useMemoryFallback = true;

        console.log('🧠 Memory cache fallback enabled');
    }

    async connect() {
        try {
            this.redis = new Redis({
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379,
                password: process.env.REDIS_PASSWORD,
                db: process.env.REDIS_DB || 0,
                retryDelayOnFailover: 0,
                maxRetriesPerRequest: 0,
                lazyConnect: true,
                connectTimeout: 20000,
                commandTimeout: 20000,
                enableOfflineQueue: false,
                maxLoadingTimeout: 20000,
            });

            this.redis.on('connect', () => {
                console.log('✅ Redis connected successfully');
                this.isConnected = true;
            });

            this.redis.on('error', () => {
                this.isConnected = false;
            });

            this.redis.on('close', () => {
                this.isConnected = false;
            });

            await this.redis.connect();
            return true;
        } catch (err) {
            console.log('📦 Using memory cache (Redis unavailable)', err.message);
            this.isConnected = false;
            return false;
        }
    }

    async disconnect() {
        if (this.redis) {
            await this.redis.quit();
            this.isConnected = false;
        }
    }

    // Memory cache helper methods
    _cleanExpiredMemoryKeys() {
        const now = Date.now();
        for (const [key, expiry] of this.memoryTTL.entries()) {
            if (expiry <= now) {
                this.memoryCache.delete(key);
                this.memoryTTL.delete(key);
            }
        }
    }

    async get(key) {
        // Try Redis first if connected
        if (this.isConnected && this.redis) {
            try {
                const value = await this.redis.get(key);
                return value ? JSON.parse(value) : null;
            } catch (_error) {
                void _error;
                // Silent fallback to memory cache
            }
        }

        // Fallback to memory cache
        if (this.useMemoryFallback) {
            this._cleanExpiredMemoryKeys();
            const value = this.memoryCache.get(key);
            return value || null;
        }

        return null;
    }

    async set(key, value, ttl = this.defaultTTL) {
        // Try Redis first if connected
        if (this.isConnected && this.redis) {
            try {
                const serializedValue = JSON.stringify(value);
                if (ttl > 0) {
                    await this.redis.setex(key, ttl, serializedValue);
                } else {
                    await this.redis.set(key, serializedValue);
                }
                return true;
            } catch (_error) {
                void _error;
                // Silent fallback to memory cache
            }
        }

        // Fallback to memory cache
        if (this.useMemoryFallback) {
            this.memoryCache.set(key, value);
            if (ttl > 0) {
                this.memoryTTL.set(key, Date.now() + (ttl * 1000));
            }
            return true;
        }

        return false;
    }

    async del(key) {
        // Try Redis first if connected
        if (this.isConnected && this.redis) {
            try {
                await this.redis.del(key);
                return true;
            } catch (_error) {
                void _error;
                // Silent fallback to memory cache
            }
        }

        // Fallback to memory cache
        if (this.useMemoryFallback) {
            this.memoryCache.delete(key);
            this.memoryTTL.delete(key);
            return true;
        }

        return false;
    }

    async exists(key) {
        // Try Redis first if connected
        if (this.isConnected && this.redis) {
            try {
                const result = await this.redis.exists(key);
                return result === 1;
            } catch (_error) {
                void _error;
                // Silent fallback to memory cache
            }
        }

        // Fallback to memory cache
        if (this.useMemoryFallback) {
            this._cleanExpiredMemoryKeys();
            return this.memoryCache.has(key);
        }

        return false;
    }

    async expire(key, ttl) {
        if (!this.isConnected || !this.redis) {
            return false;
        }

        try {
            await this.redis.expire(key, ttl);
            return true;
        } catch (_error) {
            void _error;
            // Silent fallback to memory cache
            return false;
        }
    }

    async ttl(key) {
        if (!this.isConnected || !this.redis) {
            return -1;
        }

        try {
            return await this.redis.ttl(key);
        } catch (error) {
            console.error('Redis ttl error:', error);
            return -1;
        }
    }

    async keys(pattern) {
        if (!this.isConnected || !this.redis) {
            return [];
        }

        try {
            return await this.redis.keys(pattern);
        } catch (error) {
            console.error('Redis keys error:', error);
            return [];
        }
    }

    async flush() {
        if (!this.isConnected || !this.redis) {
            return false;
        }

        try {
            await this.redis.flushdb();
            return true;
        } catch (error) {
            console.error('Redis flush error:', error);
            return false;
        }
    }

    async getStats() {
        if (!this.isConnected || !this.redis) {
            return null;
        }

        try {
            const info = await this.redis.info();
            const keys = await this.redis.dbsize();
            return {
                connected: this.isConnected,
                keys,
                info: info.split('\r\n').reduce((acc, line) => {
                    const [key, value] = line.split(':');
                    if (key && value) {
                        acc[key] = value;
                    }
                    return acc;
                }, {})
            };
        } catch (error) {
            console.error('Redis stats error:', error);
            return null;
        }
    }

    // Cache invalidation patterns
    async invalidatePattern(pattern) {
        if (!this.isConnected || !this.redis) {
            return false;
        }

        try {
            const keys = await this.keys(pattern);
            if (keys.length > 0) {
                await this.redis.del(...keys);
                console.log(`Invalidated ${keys.length} keys matching pattern: ${pattern}`);
            }
            return true;
        } catch (error) {
            console.error('Redis invalidate pattern error:', error);
            return false;
        }
    }

    // Smart cache invalidation for related data
    async invalidateRelated(key) {
        const patterns = [
            `*${key}*`,
            'quiz_*',
            'user_*',
            'category_*',
            'search_*'
        ];

        for (const pattern of patterns) {
            await this.invalidatePattern(pattern);
        }
    }
}

module.exports = RedisCacheManager;
