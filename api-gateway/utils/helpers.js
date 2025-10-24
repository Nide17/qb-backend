const axios = require('axios');
const http = require('http');
const util = require('util');
const RedisCacheManager = require('./redis-cache');

// Initialize Redis cache manager
const redisCache = new RedisCacheManager();

// In-memory cache as fallback
const memoryCache = new Map();
const MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Enhanced cache functions with Redis fallback
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

        // Fallback to memory cache
        const cached = memoryCache.get(key);
        if (cached && Date.now() - cached.timestamp < MEMORY_CACHE_TTL) {
            console.log(`💾 Memory cache hit: ${key}`);
            return cached.data;
        }

        return null;
    } catch (error) {
        console.error('Cache get error:\n', error);
        // Fallback to memory cache on error
        const cached = memoryCache.get(key);
        if (cached && Date.now() - cached.timestamp < MEMORY_CACHE_TTL) {
            return cached.data;
        }
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

        // Also set in memory cache as backup
        memoryCache.set(key, { data, timestamp: Date.now() });
    } catch (error) {
        console.error('Cache set error:\n', error);
        // Fallback to memory cache only
        memoryCache.set(key, { data, timestamp: Date.now() });
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
        console.warn(`\n\nService call failed for URL: ${url}\nError:`, err.name, err.message);
        return null;
    }
};


const makeRequest = async (req, serviceName, serviceUrl) => {
    const maxRetries = 3;
    let retries = 0;

    const makeAttempt = async () => {
        try {
            const headers = {
                'x-auth-token': req.header('x-auth-token')
            };

            // Set timeout and keep-alive properties
            const response = await axios({
                method: req.method,
                url: `${serviceUrl}${req.originalUrl}`,
                data: req.body,
                headers,
                validateStatus: function (status) {
                    return status >= 200 && status < 600;
                },
                timeout: 5000, // 5-second timeout
                httpAgent: new http.Agent({
                    keepAlive: true,
                    keepAliveMsecs: 1000
                })
            });
            return response;
        } catch (error) {
            console.error(`[${serviceName}] Request failed`, {
                retryCount: retries + 1,
                maxRetries,
                error: error.message,
                stack: error.stack
            });

            if (retries >= maxRetries ||
                error.code === 'ECONNRESET' ||
                error.code === 'ETIMEDOUT') {
                throw error;
            }

            retries++;
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries)));
            return makeAttempt();
        }
    };

    return makeAttempt();
};

const routeToService = (serviceName, serviceUrl) => async (req, res) => {

    // Check if response has already been sent
    if (res.headersSent) {
        console.log(`Response already sent for ${serviceName} request`);
        return;
    }

    // Validate serviceUrl before making requests
    if (!serviceUrl || typeof serviceUrl !== 'string' || serviceUrl.startsWith('undefined')) {
        console.warn(`Invalid or missing service URL for ${serviceName}:`, serviceUrl);
        if (!res.headersSent) {
            res.status(502).json({
                success: false,
                error: `${serviceName} Service Unavailable`,
                message: `Invalid URL or ${serviceName} service is not configured`,
                code: 'SERVICE_UNAVAILABLE',
                service: serviceName,
                timestamp: new Date().toISOString()
            });
        }
        return;
    }

    try {
        const response = await makeRequest(req, serviceName, serviceUrl);

        // Check again before sending response
        if (res.headersSent) {
            console.log(`Response headers already sent for ${serviceName}, skipping response`);
            return;
        }

        if (response && response.status && response.data !== undefined) {
            // Forward all responses, including 4xx and 5xx status codes
            try {
                // Try to send JSON normally
                res.status(response.status).json(response.data);
            } catch (serializeError) {
                // Response contained a non-serializable / circular structure. Fall back to safe stringified details.
                console.warn(`Failed to serialize response from ${serviceName}; falling back to inspect():`, serializeError.message);
                res.status(502).json({
                    success: false,
                    error: `${serviceName} Service Returned Non-Serializable Payload`,
                    message: `${serviceName} returned a response that could not be serialized to JSON`,
                    details: util.inspect(response.data, { depth: 2, breakLength: 80 }),
                    code: 'NON_SERIALIZABLE_PAYLOAD',
                    service: serviceName,
                    timestamp: new Date().toISOString()
                });
            }
        } else {
            res.status(502).json({
                success: false,
                error: `${serviceName} Service Unavailable`,
                message: `${serviceName} service is currently unavailable`,
                code: 'SERVICE_UNAVAILABLE',
                service: serviceName,
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        // Check if response has already been sent before sending error response
        if (res.headersSent) {
            console.log(`Response already sent for ${serviceName}, cannot send error response`);
            return;
        }

        try {
            console.log('Error making request: \n\n', error);
            if (error.name === 'AggregateError') {

                // // Print all errors
                // for (const err of error.cause.errors) {
                //     console.error(`\n\n - Error making ${req.method} request to ${serviceName} with url ${req.originalUrl}:`, err);
                // }

                res.status(502).json({
                    success: false,
                    error: `${serviceName} Service Unavailable`,
                    message: `${serviceName} service is currently unavailable - ${error?.cause?.errors[0]?.message}`,
                    code: 'SERVICE_UNAVAILABLE',
                    service: serviceName,
                    timestamp: new Date().toISOString()
                });
            } else {
                res.status(502).json({
                    success: false,
                    error: `${serviceName} Service Unavailable`,
                    message: `${serviceName} service is currently unavailable - ${error?.message}`,
                    code: 'SERVICE_UNAVAILABLE',
                    service: serviceName,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (_responseError) {
            console.log(`Failed to send error response for ${serviceName}:`, _responseError);
        }
    }
};

const allowList = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:5000',
    'https://www.quizblog.rw',
    'https://www.quizblog.online',
];

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowList.includes(origin)) {
            callback(null, true);
        } else {
            console.log(origin + ' is not allowed by CORS');
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    preflightContinue: false,
    optionsSuccessStatus: 200,
    maxAge: 3600
};

module.exports = {
    routeToService,
    getFromService,
    getCachedData,
    setCachedData,
    redisCache,
    memoryCache,
    corsOptions,
};
