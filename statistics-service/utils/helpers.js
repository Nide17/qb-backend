const axios = require('axios');

// Helper function to call other services
const getFromService = async (url, timeout = 40000, token) => {

    if (!url || typeof url !== 'string' || url.startsWith('undefined')) return null;

    try {
        const response = await axios.get(url, {
            timeout, // 20 seconds default timeout for normal requests, longer for long running tasks
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token,
            },
        });
        return response.data;
    } catch (err) {
        console.warn(`\n\nService call failed for URL: ${url}\nError: ${err}, \n name: ${err.name}, \nmessage: ${err.message}`);
        return null;
    }
};

// Cache for frequently accessed statistics
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes for statistics

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

module.exports = {
    getFromService,
    getCachedData,
    setCachedData,
};

// expose cache utilities for controllers that need to clear or delete specific keys
module.exports.cache = cache;
module.exports.clearCache = () => cache.clear();
module.exports.deleteCacheKey = (key) => cache.delete(key);
