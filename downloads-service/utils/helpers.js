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
        throw err;
    }
};

// Generalized helper function to validate required fields
const validateRequiredFields = (fields) => {
    for (const field of fields) {
        if (!field.value) {
            throw { message: `Missing required field: ${field.name}`, status: 400 };
        }
    }
};

// Helper function to populate related entity details based on download type
const populateOneDownload = async (download) => {

    let downloadObj = download.toObject ? download.toObject() : download;
    try {
        let [notes, downloaded_by] = await Promise.all([
            getFromService(`${process.env.COURSES_SERVICE_URL}/api/notes/${download.notes}`),
            getFromService(`${process.env.USERS_SERVICE_URL}/api/users/${download.downloaded_by}`)
        ]);

        return { ...downloadObj, notes, chapter: notes ? notes.chapter : null, course: notes ? notes.course : null, courseCategory: notes ? notes.courseCategory : null, downloaded_by };
    } catch (err) {
        return downloadObj; // Return original download if population fails
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

const populateBatchedNotes = async (notesIDs) => {

    if (!notesIDs || notesIDs.length === 0) return notesIDs;

    try {
        const response = await axios.post(`${process.env.COURSES_SERVICE_URL}/api/notes/batch`, { notesIDs }, { timeout: 20000 });
        const notesMap = new Map();
        for (const note of response.data || []) {
            notesMap.set(note._id.toString(), note);
        }
        return notesMap;
    } catch (err) {
        return new Map();
    }
};

// Populate array of downloads
const populateBatchedDownloads = async (downloads) => {

    if (!downloads || downloads.length === 0) return downloads;

    try {
        // Convert to plain objects to avoid mongoose issues
        const plainDwds = downloads.map(dwd => dwd.toObject ? dwd.toObject() : dwd);

        // Extract unique note IDs for better efficiency
        const notesIDs = [...new Set(plainDwds.map(d => d.notes?.toString()))];

        // Extract unique user IDs for better efficiency
        const usersIDs = [...new Set(plainDwds.map(d => d.downloaded_by?.toString()))];

        // Populating
        const batchedNotes = await populateBatchedNotes(notesIDs);
        const batchedUsers = await populateBatchedUsers(usersIDs);

        // Map plainDwds to expanded objects
        const expandedPlainDwds = plainDwds.map(dwd => {
            const expandedDwd = { ...dwd };

            if (dwd.notes) {
                let notes = batchedNotes.get(dwd.notes.toString());

                if (notes) {
                    expandedDwd.notes = {
                        _id: notes._id,
                        title: notes.title,
                    };
                    expandedDwd.chapter = {
                        _id: notes.chapter._id,
                        title: notes.chapter.title
                    }
                    expandedDwd.course = {
                        _id: notes.course._id,
                        title: notes.course.title
                    }
                    expandedDwd.courseCategory = {
                        _id: notes.courseCategory._id,
                        title: notes.courseCategory.title
                    }
                }
            }

            if (dwd.downloaded_by) {
                expandedDwd.downloaded_by = batchedUsers.get(dwd.downloaded_by.toString());
            }
            return expandedDwd;
        });

        return expandedPlainDwds || plainDwds;
    } catch (err) {
        console.error(err.message);
        return {}
    }
};

module.exports = {
    populateOneDownload,
    populateBatchedDownloads,
    getFromService,
    validateRequiredFields,
    getCachedData,
    setCachedData,
    redisCache,
    deleteCacheKey: (key) => redisCache.del(key),
    clearCache: () => redisCache.flush()
};
