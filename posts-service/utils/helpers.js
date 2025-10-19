const axios = require('axios');
const PostCategory = require("../models/blog-posts/PostCategory");
const ImageUpload = require("../models/blog-posts/ImageUpload");
const { handleError } = require('./error');
const { S3 } = require("@aws-sdk/client-s3");

const s3Config = new S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    Bucket: process.env.S3_BUCKET,
    region: process.env.AWS_REGION
});

// Helper function to call other services
const callService = async (url, timeout = 40000, token) => {

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
    const data = await callService(`${process.env.USERS_SERVICE_URL}/api/users/${userId}`);

    return data ? {
        _id: data._id,
        name: data.name
    } : { _id: userId, name: 'Unknown User' };
};

// Helper function to find postCategory by ID
const findPostCategoryById = async (id, res, selectFields = '') => {
    try {
        const postCategory = await PostCategory.findById(id).select(selectFields);
        if (!postCategory) return res.status(404).json({ message: 'No postCategory found!' });

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
        handleError(res, err);
        return null;
    }
};

// Helper function to image upload by ID
const findImageUploadById = async (id, res, selectFields = '') => {
    try {
        const imageUpload = await ImageUpload.findById(id).select(selectFields);
        if (!imageUpload) return res.status(404).json({ message: 'Image upload not found!' });

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
        handleError(res, err);
        return null;
    }
};

// Populate single blog post
const populateBlogPost = async (res, blogPost) => {
    if (!blogPost) return blogPost;

    // Convert to plain object to avoid mongoose issues
    const plainPost = blogPost.toObject ? blogPost.toObject() : blogPost;

    if (plainPost.creator) {
        plainPost.creator = await populateUser(plainPost.creator);
    }
    return plainPost;
};

// Populate multiple blog posts
const populateBlogPosts = async (res, blogPosts) => {
    if (!blogPosts || !Array.isArray(blogPosts)) return blogPosts;

    return Promise.all(blogPosts.map(post => populateBlogPost(res, post)));
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
    const params = {
        Bucket: process.env.S3_BUCKET,
        Key: imagePath.split('/').pop()
    };
    return s3Config.deleteObject(params).promise();
};

module.exports = { s3Config, populateBlogPost, populateBlogPosts, populateUser, callService, findPostCategoryById, findImageUploadById, validateRequiredFields, deleteImageFromS3 };
