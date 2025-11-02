const axios = require('axios');
const util = require('util');
const http = require('http');
const https = require('https');
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
        console.error('Cache get error:\n', error);
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
        console.error('Cache set error:\n', error);
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
        // console.warn(`\n\nService call failed for URL: ${url}\nError:`, err.name, err.message);
        return null;
    }
};


const makeRequest = async (req, serviceName, serviceUrl) => {

    const makeAttempt = async () => {
        
        const maxRetries = 3;
        let retries = 0;

        try {
            // Forward original headers to preserve Content-Type (including multipart boundary)
            const forwardedHeaders = Object.assign({}, req.headers);

            // Ensure the gateway auth header is present / preferred
            forwardedHeaders['x-auth-token'] = req.header('x-auth-token') || forwardedHeaders['x-auth-token'];

            // Remove/override host header so axios sets it correctly for the target
            delete forwardedHeaders.host;

            // Decide whether to forward the parsed JSON body (if express.json ran)
            // or stream the raw request for multipart/file uploads.
            const contentType = forwardedHeaders['content-type'] || forwardedHeaders['Content-Type'] || '';
            const isJson = typeof contentType === 'string' && contentType.includes('application/json');

            // If the gateway already parsed JSON (express.json middleware), forward req.body
            // as the data so axios can serialize it correctly. For multipart/form-data or
            // other streaming endpoints, stream the original request.
            const bodyToSend = isJson ? req.body : req;

            // Remove content-length/transfer-encoding when forwarding parsed bodies so axios
            // computes the correct Content-Length for the proxied request. For streamed
            // raw requests we keep headers intact.
            if (isJson) {
                delete forwardedHeaders['content-length'];
                delete forwardedHeaders['Content-Length'];
                delete forwardedHeaders['transfer-encoding'];
                delete forwardedHeaders['Transfer-Encoding'];
            }

            const response = await axios({
                method: req.method,
                url: `${serviceUrl}${req.originalUrl}`,
                data: bodyToSend,
                headers: forwardedHeaders,
                validateStatus: function (status) {
                    return status >= 200 && status < 600;
                },
                timeout: 60000, // 60-second timeout
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                httpAgent: process.env.NODE_ENV === 'production' ?
                    new https.Agent({
                        keepAlive: true,
                        keepAliveMsecs: 1000
                    }) :
                    new http.Agent({
                        keepAlive: true,
                        keepAliveMsecs: 1000
                    })
            });
            return response;
        } catch (error) {

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

    try {
        if (!serviceUrl || typeof serviceUrl !== 'string' || serviceUrl.startsWith('undefined')) {
            console.warn(`Invalid or missing service URL for ${serviceName}:`, serviceUrl);
            throw new Error(`Invalid or missing service URL for ${serviceName}: ${serviceUrl}`);
        }

        const response = await makeRequest(req, serviceName, serviceUrl);

        if (response.status >= 400) {
            throw new Error(`Service call failed for URL: ${req.originalUrl}\nStatus: ${response.status}`);
        }

        res.status(response.status).json(response.data);
    } catch (err) {
        console.log(err.name, err.message)
        throw err;
    }
};

module.exports = {
    routeToService,
    getFromService,
    getCachedData,
    setCachedData,
    redisCache,
};
