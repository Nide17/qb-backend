const axios = require('axios');
const PostCategory = require('../models/blog-posts/PostCategory');
const ImageUpload = require('../models/blog-posts/ImageUpload');
const { S3 } = require('@aws-sdk/client-s3');

const s3Config = new S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    Bucket: process.env.S3_BUCKET,
    region: process.env.AWS_REGION
});

// Helper function to call other services
const getFromService = async (url, timeout = 40000, token) => {

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

// Simple population function for users
const populateUser = async (userId) => {

    if (!userId) return null;
    const usr = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users/${userId}`);

    return usr ? {
        _id: usr._id,
        name: usr.name
    } : { _id: userId, name: 'Unknown User' };
};

// Helper function to find postCategory by ID
// Helpers should not depend on `res`. They should throw and let controllers
// call handleError(res, err) to centralize HTTP responses.
const findPostCategoryById = async (id, selectFields = '') => {
    try {
        const postCategory = await PostCategory.findById(id).select(selectFields);
        if (!postCategory) {
            throw { statusCode: 404, message: 'No postCategory found!' };
        }

        // Populate creator details
        let postCategoryObj = postCategory.toObject ? postCategory.toObject() : postCategory;
        if (postCategory.creator) {
            const userData = await populateUser(postCategory.creator);
            if (userData) {
                postCategoryObj.creator = { _id: userData._id, name: userData.name };
            }
        }

        return postCategoryObj;
    } catch (err) {
        throw err;
    }
};

// Helper function to find image upload by ID
const findImageUploadById = async (id, selectFields = '') => {
    try {
        const imageUpload = await ImageUpload.findById(id).select(selectFields);
        if (!imageUpload) {
            throw { statusCode: 404, message: 'Image upload not found!' };
        }

        // Populate owner details
        let imageUploadObj = imageUpload.toObject ? imageUpload.toObject() : imageUpload;
        if (imageUpload.owner) {
            const userData = await populateUser(imageUpload.owner);
            if (userData) {
                imageUploadObj.owner = { _id: userData._id, name: userData.name };
            }
        }

        return imageUploadObj;
    } catch (err) {
        throw err;
    }
};

// Helper function to validate required fields
const validateRequiredFields = (fields) => {
    for (const field of fields) {
        if (!field.value) {
            throw new Error(`Missing required field: ${field.name}`);
        }
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
                console.error('Error deleting object:', err);
            } else {
                console.log('Object deleted successfully:', data);
            }
        });
    } catch (err) {
        throw new Error(`Error deleting image: ${err.message}`);
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
    s3Config,
    populateUser,
    getFromService,
    findPostCategoryById,
    findImageUploadById,
    validateRequiredFields,
    deleteImageFromS3,
    corsOptions,
};
