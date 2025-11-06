const axios = require('axios');
const Quiz = require('../models/Quiz');
const { S3 } = require('@aws-sdk/client-s3');
const RedisCacheManager = require('./redis-cache');

const s3Config = new S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    Bucket: process.env.S3_BUCKET,
    region: process.env.AWS_REGION
});

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

const setCachedData = async (key, data, ttl = 300) => {
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
const getFromService = async (url, timeout = 20000, token) => {

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
        const data = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users/${userId}`);

        return data ? {
            _id: data._id,
            name: data.name
        } : { _id: userId, name: 'Unknown User' };
    } catch (err) {
        return { _id: userId, name: 'Unknown User' };
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

// Simple population function for category
const populateOneCategory = async (category) => {

    if (!category) return null;

    let categoryObj = category.toObject ? category.toObject() : category;

    try {
        // Fetch courseCategory details
        if (category.courseCategory) {
            const cCategoryData = await getFromService(`${process.env.COURSES_SERVICE_URL}/api/course-categories/${category.courseCategory}`);
            if (cCategoryData) {
                categoryObj.courseCategory = cCategoryData;
            }
        }

        if (category.created_by) {
            const userData = await populateOneUser(category.created_by);
            if (userData) {
                categoryObj.created_by = userData;
            }
        }

        return categoryObj;
    } catch (error) {
        return categoryObj;
    }
};

const populateBatchedCourseCategories = async (courseCategoriesIDs) => {

    if (!courseCategoriesIDs || courseCategoriesIDs.length === 0) return courseCategoriesIDs;

    try {
        const response = await axios.post(`${process.env.COURSES_SERVICE_URL}/api/course-categories/batch`, { courseCategoriesIDs }, { timeout: 20000 });
        const courseCategoriesMap = new Map();
        for (const cc of response.data || []) {
            courseCategoriesMap.set(cc._id.toString(), cc);
        }
        return courseCategoriesMap;
    } catch (err) {
        return new Map();
    }
};

const populateCategories = async (categories) => {

    if (!categories || categories.length === 0) return categories;

    try {
        // Convert to plain objects to avoid mongoose issues
        const plainCategories = categories.map(category => category.toObject ? category.toObject() : category);

        // Extract unique courseCategory IDs for better efficiency
        const courseCategoriesIDs = [...new Set(plainCategories.map(c => c.courseCategory?.toString()))];

        // Populate all courseCategory details in batch (assumed returns a map-like object or record)
        const courseCategoriesMap = await populateBatchedCourseCategories(courseCategoriesIDs);

        // Map plainCategories to expanded objects
        const expandedPlainCategories = plainCategories.map(category => {
            const expandedCategory = { ...category };
            if (category.courseCategory && courseCategoriesMap.has(category.courseCategory.toString())) {
                expandedCategory.courseCategory = courseCategoriesMap.get(category.courseCategory.toString());
            }
            return expandedCategory;
        });

        return expandedPlainCategories || plainCategories;
    } catch (err) {
        return categories;
    }
};

// Helper function to validate required fields
const validateRequiredFields = (fields) => {
    for (const field of fields) {
        if (!field.value) {
            throw { 'message': `Missing required field: ${field.name}`, 'status': 400 };
        }
    }
};

const updateQuizQuestions = async (quizId, questionId, action) => {

    try {
        const quiz = await Quiz.findById(quizId);

        if (!quiz) throw { 'message': 'Quiz not found while updating questions!', 'status': 404 };

        if (action === 'add') {
            quiz.questions.push(questionId);
        } else if (action === 'remove') {
            quiz.questions.pull(questionId);
        }
        await quiz.save();
        return true;
    } catch (err) {
        throw { 'message': 'Error updating quiz questions!', 'status': 500 };
    }
};

// Helper function to delete image from S3
const deleteImageFromS3 = async (imagePath) => {
    try {
        const deleteParams = {
            Bucket: process.env.S3_BUCKET,
            Key: imagePath.split('/').pop()
        };
        s3Config.deleteObject(deleteParams, function (err, data) {
            if (err) {
                console.error('Error deleting object:', err.message);
            } else {
                console.log('Deleted Object:', data);
            }
        });
    } catch (err) {
        throw { 'message': `Error deleting image: ${err.message}`, 'status': 500 };
    }
};

// Populate array of quizzes
const populateBatchedQuizzes = async (quizzes) => {

    if (!quizzes || quizzes.length === 0) return quizzes;

    try {
        // Convert to plain objects to avoid mongoose issues
        const plainQuizzes = quizzes.map(quiz => quiz.toObject ? quiz.toObject() : quiz);

        // Extract unique user IDs for better efficiency
        const usersIDs = [...new Set(plainQuizzes.map(q => q.created_by?.toString()))];

        // Populate all user details in batch (assumed returns a map-like object or record)
        const batchedUsers = await populateBatchedUsers(usersIDs);

        // Map plainQuizzes to expanded objects
        const expandedPlainQuizzes = plainQuizzes.map(qz => {
            const expandedQz = { ...qz };
            if (qz.created_by) {
                expandedQz.created_by = batchedUsers.get(qz.created_by.toString());
            }
            return expandedQz;
        });

        return expandedPlainQuizzes || plainQuizzes;
    } catch (err) {
        console.error(err.message);
        return {}
    }
};

module.exports = {
    getFromService,
    validateRequiredFields,
    populateOneUser,
    populateBatchedUsers,
    populateOneCategory,
    updateQuizQuestions,
    deleteImageFromS3,
    populateBatchedQuizzes,
    populateCategories,
    redisCache,
    setCachedData,
    getCachedData,
};
