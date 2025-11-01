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
        console.warn(`\n\nService call failed for URL: ${url}\nError:`, err.name, err.message);
        return null;
    }
};


const makeRequest = async (req, serviceName, serviceUrl) => {
    const maxRetries = 3;
    let retries = 0;

    const makeAttempt = async () => {
        try {
            // Forward original headers to preserve Content-Type (including multipart boundary)
            const forwardedHeaders = Object.assign({}, req.headers);
            // Ensure our gateway auth header is present / preferred
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

module.exports = {
    routeToService,
    getFromService,
    getCachedData,
    setCachedData,
    redisCache,
};
