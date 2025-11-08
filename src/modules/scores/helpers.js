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

const setCachedData = async (key, data, ttl = 600) => {
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

// Simple expansion function for users
const populateOneUser = async (userId) => {

    if (!userId) return null;

    try {
        const usr = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users/${userId}`);

        return usr ? {
            _id: usr._id,
            name: usr.name
        } : { _id: userId, name: 'Unknown User' };
    } catch (err) {
        return { _id: userId, name: 'Unknown User' };
    }
};
// Expand score 
const populateOneScore = async (score) => {

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
            const userData = await populateOneUser(score.taken_by);
            if (userData) {
                scoreObj.taken_by = userData;
            }
        }

        return scoreObj;
    } catch (error) {
        return scoreObj;
    }
};

const populateBatchedUsers = async (usersIDs) => {

    if (!usersIDs || usersIDs.length === 0) return usersIDs;

    try {
        const response = await axios.post(`${process.env.USERS_SERVICE_URL}/api/users/batch`, { usersIDs }, { timeout: 20000 });
        const usersMap = new Map();
        for (const user of response.data || []) {
            usersMap.set(user._id.toString(), user);
        }
        return usersMap;
    } catch (err) {
        return new Map();
    }
};

const populateBatchedQuizzes = async (quizzesIDs) => {

    if (!quizzesIDs || quizzesIDs.length === 0) return quizzesIDs;

    try {
        const response = await axios.post(`${process.env.QUIZZING_SERVICE_URL}/api/quizzes/batch`, { quizzesIDs }, { timeout: 20000 });
        const quizzesMap = new Map();
        for (const quiz of response.data || []) {
            quizzesMap.set(quiz._id.toString(), {
                _id: quiz._id,
                title: quiz.title,
                category: {
                    _id: quiz.category._id,
                    title: quiz.category.title
                }
            });
        }
        return quizzesMap;
    } catch (err) {
        return new Map();
    }
};

const populateBatchedScores = async (scores) => {

    if (!scores || scores.length === 0) return null;

    try {
        // Convert to plain objects to avoid mongoose issues
        const plainScores = scores.map(score => score.toObject ? score.toObject() : score);

        // Extract unique quizzes IDs for better efficiency
        const quizzesIDs = [...new Set(plainScores.map(sc => sc.quiz?.toString()))];

        // Extract unique user IDs for better efficiency
        const usersIDs = [...new Set(plainScores.map(s => s.taken_by?.toString()))];

        // Populating
        const batchedQuizzes = await populateBatchedQuizzes(quizzesIDs);
        const batchedUsers = await populateBatchedUsers(usersIDs);

        // Map plainScores to expanded objects
        const expandedPlainScores = plainScores.map(score => {

            const expandedScore = { ...score };

            if (score.quiz) {

                let quiz = batchedQuizzes.get(score.quiz.toString());

                expandedScore.quiz = {
                    _id: quiz?._id,
                    title: quiz?.title,
                }
                expandedScore.category = {
                    _id: quiz?.category?._id,
                    title: quiz?.category?.title
                }
            }

            if (score.taken_by) {
                expandedScore.taken_by = batchedUsers.get(score.taken_by.toString());
            }
            return expandedScore;
        });

        return expandedPlainScores || plainScores;
    } catch (err) {
        console.error(err.message);
        return {}
    }
}

module.exports = {
    populateOneScore,
    populateBatchedScores,
    getFromService,
    getCachedData,
    setCachedData,
    redisCache,
    deleteCacheKey: (key) => redisCache.del(key),
    clearCache: () => redisCache.flush()
};
