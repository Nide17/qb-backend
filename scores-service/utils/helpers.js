const axios = require('axios');

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
        console.warn(`\n\nService call failed for URL: ${url}\nError:`, err.name, err.message);
        return null;
    }
};

// Cache for frequently accessed data
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper function to get cached data
const getCachedData = (key) => {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    cache.delete(key);
    return null;
};

// Helper function to set cached data
const setCachedData = (key, data) => {
    cache.set(key, { data, timestamp: Date.now() });
};

// Clear expired cache entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
        if (now - value.timestamp >= CACHE_TTL) {
            cache.delete(key);
        }
    }
}, CACHE_TTL);

// Simple population function for users
const populateUser = async (userId) => {
    if (!userId) return null;
    const data = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users/${userId}`);

    return data ? {
        _id: data._id,
        name: data.name
    } : { _id: userId, name: 'Unknown User' };
};

// Populate score 
const populateScore = async (score) => {

    if (!score) return null;
    let scoreObj = score.toObject ? score.toObject() : score;

    try {
        // Fetch category 
        if (score.category) {
            const categoryData = await getFromService(`${process.env.QUIZZING_SERVICE_URL}/api/categories/${score.category}`);
            if (categoryData) {
                scoreObj.category = categoryData;

                if (score.quiz) {
                    const quizData = await getFromService(`${process.env.QUIZZING_SERVICE_URL}/api/quizzes/${score.quiz}`);
                    if (quizData) {
                        scoreObj.quiz = quizData;
                    }
                }
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
        console.log('Error populating score :', error.message);
        return scoreObj;
    }
};

module.exports = {
    getCachedData,
    setCachedData,
    populateScore,
    getFromService,
};
