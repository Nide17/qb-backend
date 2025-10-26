const axios = require('axios');

// Helper function to call other services
const getFromService = async (url, timeout = 60000, token) => {

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

// Generalized helper function to validate required fields
const validateRequiredFields = (fields) => {
    for (const field of fields) {
        if (!field.value) {
            throw { message: `Missing required field: ${field.name}`, statusCode: 400 };
        }
    }
};

// Helper function to populate related entity details based on download type
const populateDownload = async (download) => {

    let downloadObj = download.toObject ? download.toObject() : download;
    try {
        let [notes, downloaded_by] = await Promise.all([
            getFromService(`${process.env.COURSES_SERVICE_URL}/api/notes/${download.notes}`),
            getFromService(`${process.env.USERS_SERVICE_URL}/api/users/${download.downloaded_by}`)
        ]);

        return { ...downloadObj, notes, chapter: notes ? notes.chapter : null, course: notes ? notes.course : null, courseCategory: notes ? notes.courseCategory : null, downloaded_by };
    } catch (err) {
        console.error('Error populating download details:', err.message);
        return download; // Return original download if population fails
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
    populateDownload,
    getFromService,
    validateRequiredFields,
    getCachedData,
    setCachedData,
    cache,
    corsOptions,
};
