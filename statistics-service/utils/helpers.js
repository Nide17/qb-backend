const axios = require('axios');

// Helper function to call other services
const callService = async (url, timeout = 20000) => {

    if (!url || typeof url !== 'string' || url.startsWith('undefined')) return null;

    try {
        const response = await axios.get(url, {
            timeout: timeout, // 20 seconds default timeout for normal requests, longer for long running tasks
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (err) {
        console.warn(`\n\nService call failed for URL: ${url}\nError:`, err.name, err.message);
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

// Populate statistics details
const populateStatisticsDetails = async (res, statistics) => {
    if (!statistics) return null;

    let statisticsObj = statistics.toObject ? statistics.toObject() : statistics;

    // Example: Populate related data for statistics
    const relatedData = await callService(`${process.env.RELATED_SERVICE_URL}/api/related/${statistics.relatedId}`);

    statisticsObj.relatedData = relatedData || statistics.relatedData;

    return statisticsObj;
};

module.exports = { callService, populateStatisticsDetails, getCachedData, setCachedData };