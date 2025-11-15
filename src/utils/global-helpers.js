const { S3 } = require("@aws-sdk/client-s3");
const RedisCacheManager = require("./redis-cache");

const cacheManager = new RedisCacheManager();

/**
 * Wrapper: Safely get from Redis cache
 */
const getCachedData = async (key) => {
    try {
        if (cacheManager.isReady()) {
            const cached = await cacheManager.get(key);
            if (cached !== null) {
                console.log(`📦 Redis HIT → "${key}"`);
            }
            console.log(`📦 Redis MISS → "${key}"`);
        }
        return null;
    } catch (err) {
        console.error("Redis get error:", err.message || err);
        return null;
    }
};

/**
 * Wrapper: Safely set Redis cache
 */
const setCachedData = async (key, data, ttl = 600) => {
    try {
        if (cacheManager.isReady()) {
            await cacheManager.set(key, data, ttl);
            console.log(`📦 Redis SET → "${key}" (TTL ${ttl}s)`);
        }
    } catch (err) {
        console.error("Redis set error:", err.message || err);
    }
};

// -------------------------------------
// AWS S3 CONFIG (AWS SDK v3 best practice)
// -------------------------------------

const s3Config = new S3({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});

/**
 * Validate required fields
 */
const validateRequiredFields = (fields) => {
    for (const { name, value } of fields) {
        if (value === undefined || value === null || value === "") {
            const error = new Error(`Missing required field: ${name}`);
            error.status = 400;
            throw error;
        }
    }
};

// --- Cache wrapper -------------------------------------------------------------
const cacheWrapper = {
    async wrap(key, ttl, fetchFn) {
        try {

            const fresh = await fetchFn();
            await setCachedData(key, fresh, ttl);

            return fresh;
        } catch (e) {
            console.error("Cache wrap error:", e);
            return fetchFn(); // fallback to DB
        }
    }
};

module.exports = {
    getCachedData,
    setCachedData,
    cacheWrapper,
    cacheManager,
    s3Config,
    validateRequiredFields,
};
