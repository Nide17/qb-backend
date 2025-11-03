const axios = require('axios');
const RedisCacheManager = require('./redis-cache');

// Initialize Redis cache manager
const redisCache = new RedisCacheManager();

// Enhanced cache functions with Redis
const getCachedData = async (key) => {
    try {
        // Try Redis first
        if (redisCache.isConnected) {
            const cached = await redisCache.get(key);
            if (cached) {
                console.log(`📦 Redis cache hit: ${key}`);
                return cached;
            }
        }

        return null;
    } catch (error) {
        console.error('Cache get error:\n', error.message);
        return null;
    }
};

const setCachedData = async (key, data, ttl = 300) => {
    try {
        // Set in Redis first
        if (redisCache.isConnected) {
            await redisCache.set(key, data, ttl);
            console.log(`📦 Redis cache set: ${key} (TTL: ${ttl}s)`);
        }
    } catch (error) {
        console.error('Cache set error:\n', error.message);
    }
};

// Helper function to call other services
const getFromService = async (url, timeout = 70000, token) => {

    if (!url || typeof url !== 'string' || url.startsWith('undefined')) return null;

    try {
        const response = await axios.get(url, {
            timeout, // 20 seconds default timeout for normal requests, longer for long running tasks
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token
            }
        });
        return response.data;
    } catch (err) {
        throw err;
    }
};

// Simple population function for users
const populateUser = async (userId) => {

    if (!userId) return null;

    try {
        const data = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users/${userId}`);

        return data ? {
            _id: data._id,
            name: data.name
        } : { _id: userId, name: 'Unknown User' };
    } catch (err) {
        return { _id: userId, name: 'Unknown User' };
    }
};
// Populate score 
const populateScore = async (score) => {

    if (!score) return null;
    let scoreObj = score.toObject ? score.toObject() : score;

    try {
        if (score.quiz) {
            const quizData = await getFromService(`${process.env.QUIZZING_SERVICE_URL}/api/quizzes/${score.quiz}`);
            if (quizData) {
                scoreObj.quiz = quizData;
                scoreObj.category = quizData.category;
            }
        }

        if (score.taken_by) {
            const userData = await populateUser(score.taken_by);
            if (userData) {
                scoreObj.taken_by = userData;
            }
        }

        return scoreObj;
    } catch (error) {
        return scoreObj;
    }
};

module.exports = {
    populateScore,
    getFromService,
    getCachedData,
    setCachedData,
    redisCache,
    deleteCacheKey: (key) => redisCache.del(key),
    clearCache: () => redisCache.flush()
};
