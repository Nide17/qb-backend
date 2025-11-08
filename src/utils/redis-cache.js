const Redis = require('ioredis');

class RedisCacheManager {
    constructor() {
        this.redis = null;
        this.isConnected = false;
        this.defaultTTL = 600; // 10 minutes in seconds
        this.retryDelay = 30000; // 30 seconds
        this.maxRetries = 1;
    }

    async connect() {
        if (this.isConnected) {
            return true;
        }
        try {
            this.redis = new Redis(process.env.REDIS_UR);

            this.redis.on('connect', () => {
                console.log('✅ Redis connected successfully');
                this.isConnected = true;
            });

            this.redis.on('error', (err) => {
                console.log("❌ Failed to connect to redis. Error:", err.message);
                this.isConnected = false;
            });

            this.redis.on('close', () => {
                this.isConnected = false;
            });

            await this.redis.connect();
            return true;
        } catch (err) {
            this.isConnected = false;
            return false;
        }
    }

    async disconnect() {
        if (this.redis) {
            try {
                if (this.isConnected && this.redis.status === 'ready') {
                    await this.redis.quit();
                    console.log('✅ Redis disconnected gracefully');
                } else {
                    console.log('⚠️ Redis: ', this.redis.status);
                    this.redis.disconnect(); // force close without sending commands
                }
            } catch (err) {
                console.error('Redis disconnect error:', err.message);
                this.redis.disconnect();
            } finally {
                this.isConnected = false;
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
            }
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
            }
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
            }
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
            }
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

    async invalidateKeysCache(keys) {
        for (const key of keys) {
            await this.del(key);
        }
    }
}

module.exports = RedisCacheManager;
