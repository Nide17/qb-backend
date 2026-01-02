const { S3, DeleteObjectCommand } = require("@aws-sdk/client-s3");
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
 * Extract S3 key from full S3 URL
 * Also handles URL-encoded keys
 */
const extractS3Key = (s3Url) => {
    if (!s3Url || typeof s3Url !== 'string') return null;

    try {
        const url = new URL(s3Url);
        let pathname = url.pathname;

        // Remove leading slash
        pathname = pathname.startsWith('/') ? pathname.substring(1) : pathname;

        // Decode URL encoding (e.g., %20 -> space, %5B -> [, %5D -> ])
        pathname = decodeURIComponent(pathname);

        console.log(`📝 Extracted S3 Key: ${pathname}`);
        return pathname;
    } catch (error) {
        console.error('Error parsing S3 URL:', error);
        return null;
    }
};

/**
 * Delete file from S3 - FIXED FOR AWS SDK v3
 */
const deleteS3File = async (s3Key) => {
    if (!s3Key) {
        console.warn('⚠️  No S3 key provided for deletion');
        return false;
    }

    try {
        console.log(`🗑️  Attempting to delete S3 file from bucket: ${process.env.S3_BUCKET}`);
        console.log(`🗑️  Key: ${s3Key}`);

        // ✅ CORRECT WAY for AWS SDK v3: Use DeleteObjectCommand
        const deleteCommand = new DeleteObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: s3Key,
        });

        const result = await s3Config.send(deleteCommand);

        console.log(`✅ Successfully deleted S3 file: ${s3Key}`);
        console.log(`📋 Delete result:`, result);

        return true;
    } catch (error) {
        console.error(`❌ Error deleting S3 file ${s3Key}:`, error);
        console.error(`❌ Error code: ${error.Code || error.name}`);
        console.error(`❌ Error message: ${error.message}`);

        // Don't throw error - log it but continue with update
        return false;
    }
};

/**
 * Verify S3 file was deleted (optional but helpful for debugging)
 */
const verifyS3FileDeletion = async (s3Key) => {
    const { HeadObjectCommand } = require("@aws-sdk/client-s3");

    try {
        const headCommand = new HeadObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: s3Key,
        });

        await s3Config.send(headCommand);

        // If we get here, file still exists
        console.log(`⚠️  File still exists: ${s3Key}`);
        return false; // File NOT deleted
    } catch (error) {
        if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
            // File doesn't exist (successfully deleted)
            console.log(`✅ Verified file deleted: ${s3Key}`);
            return true;
        }

        console.error('Error verifying deletion:', error);
        return false;
    }
};

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
            // if (cached !== undefined && cached !== null) console.log(cached);
            if (cached !== undefined && cached !== null) return cached;

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
    deleteS3File,
    extractS3Key,
    verifyS3FileDeletion,
    validateRequiredFields,
};
