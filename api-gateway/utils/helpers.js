const axios = require('axios');
const util = require('util');
const http = require('http');
const https = require('https');
const RedisCacheManager = require('./redis-cache');
const { handleError } = require('./error');

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
        console.error('Cache get error:\n', error?.message || error);
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
        console.error('Cache set error:\n', error?.message || error);
    }
};

// Helper function to call other services
const getFromService = async (url, timeout = 60000) => {

    if (!url || typeof url !== 'string' || url.startsWith('undefined')) return null;

    try {
        const response = await axios.get(url, {
            timeout, // 60 seconds default timeout for normal requests, longer for long running tasks
            headers: {
                'Content-Type': 'application/json',
            }
        });
        return response.data;
    } catch (err) {
        return null;
    }
};

const makeRequest = async (req, serviceUrl) => {
    const maxRetries = 3;

    // Forward original headers
    const forwardedHeaders = { ...req.headers };
    forwardedHeaders['x-auth-token'] = req.header('x-auth-token') || forwardedHeaders['x-auth-token'];
    delete forwardedHeaders.host;

    const contentType = forwardedHeaders['content-type'] || forwardedHeaders['Content-Type'] || '';
    const isJson = typeof contentType === 'string' && contentType.includes('application/json');
    const bodyToSend = isJson ? req.body : req;

    if (isJson) {
        delete forwardedHeaders['content-length'];
        delete forwardedHeaders['Content-Length'];
        delete forwardedHeaders['transfer-encoding'];
        delete forwardedHeaders['Transfer-Encoding'];
    }

    for (let retries = 0; retries <= maxRetries; retries++) {
        try {
            const response = await axios({
                method: req.method,
                url: `${serviceUrl}${req.originalUrl}`,
                data: bodyToSend,
                headers: forwardedHeaders,
                validateStatus: status => status >= 200 && status < 600,
                timeout: 60000,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                httpAgent: process.env.NODE_ENV === 'production'
                    ? new https.Agent({ keepAlive: true, keepAliveMsecs: 1000 })
                    : new http.Agent({ keepAlive: true, keepAliveMsecs: 1000 }),
            });
            return response;
        } catch (error) {
            if (retries === maxRetries) throw error;
            console.log(`Retry number: ${retries}`);
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries)));
        }
    }
};

const routeToService = (serviceName, serviceUrl) => async (req, res) => {

    try {
        if (!serviceUrl || typeof serviceUrl !== 'string' || serviceUrl.startsWith('undefined')) {
            console.warn(`Invalid or missing service URL for ${serviceName}:`, serviceUrl);
            throw new Error(`Invalid or missing service URL for ${serviceName}: ${serviceUrl}`);
        }

        const response = await makeRequest(req, serviceUrl);
        res.status(response.status).json(response.data);
    } catch (err) {
        console.error('Route to service error occurred:', err?.message || err);
        handleError(res, err);
    }
};

module.exports = {
    routeToService,
    getFromService,
    getCachedData,
    setCachedData,
    redisCache,
};
