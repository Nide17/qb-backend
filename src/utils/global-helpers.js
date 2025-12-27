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

            if (cached !== undefined && cached !== null) {
                console.log(`📦 Redis HIT → "${key}"`);
                return cached;
            }

            console.log(`📦 Redis MISS → "${key}"`);
            return null;
        }

        return null;
    } catch (err) {
        console.error("Redis get error:", err.message || err);
        return null;
    }
};

function isCacheable(value) {
    if (value === undefined) return false;
    if (value === null) return false;
    if (typeof value === "number" && isNaN(value)) return false;

    // Empty primitives
    if (typeof value === "string" && value.trim() === "") return false;

    // Arrays
    if (Array.isArray(value) && value.length === 0) return false;

    // Objects
    if (typeof value === "object") {
        if (value.constructor === Object && Object.keys(value).length === 0) return false;
        if (value instanceof Map && value.size === 0) return false;
        if (value instanceof Set && value.size === 0) return false;
    }

    return true;
}

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
            // 1️⃣ Try Redis
            const cached = await getCachedData(key);
            if (cached !== undefined && cached !== null) console.log(cached);
            // if (cached !== undefined && cached !== null) return cached;

            // 2️⃣ Cache MISS → Fetch from DB
            const fresh = await fetchFn();

            // 3️⃣ Only cache if valid
            if (isCacheable(fresh)) {
                await setCachedData(key, fresh, ttl);
            } else {
                console.log(`⚠️ Skipped caching invalid/empty data for key "${key}"`);
            }

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
