const PostCategory = require('../../models/blog-posts/PostCategory');
const { getBatchedUsers } = require('../../../users/helpers');
const { handleError } = require('../../../../utils/error');
const { deleteImageFromS3, validateRequiredFields, setCachedData, getCachedData } = require('../../../../utils/global-helpers');
const User = require('../../../users/models/User');

const keysToClear = new Set();
// Refactored code to use reusable utilities and align with patterns from other services.
exports.getPostCategories = async (req, res) => {
    try {
        const cacheKey = 'all_post_categories';
        const cached = await getCachedData(cacheKey);
        if (cached) keysToClear.add(cacheKey);
        const postCategories = await PostCategory.find().sort({ createdAt: -1 });
        if (!postCategories || postCategories.length === 0) throw { 'status': 204, 'message': 'No postCategories found!' };

        // Extract unique user IDs for better efficiency
        const usersIDs = [...new Set(postCategories.map(ch => ch.creator?.toString()))];

        // Populate all user details in batch (assumed returns a map-like object or record)
        const batchedUsers = await getBatchedUsers(usersIDs);

        // Map postCategories to expanded objects
        const expandedPostCategories = postCategories.map(pc => {
            const pcObj = pc.toObject();
            const creator = batchedUsers.get(pc.creator?.toString()) || pc.creator;
            return { ...pcObj, creator };
        });
        const result = expandedPostCategories || postCategories;

        // Set cache
        await setCachedData(cacheKey, result, 600) && keysToClear.add(cacheKey);
        res.status(200).json(result);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOnePostCategory = async (req, res) => {

    try {
        let postCategory = await PostCategory.findById(req.params.id);
        if (!postCategory) throw { status: 404, message: 'Image upload not found!' };

        // Populate user
        postCategory = postCategory.toObject ? postCategory.toObject() : postCategory;
        postCategory.creator = await User.findById(postCategory.creator).select('-password -__v -createdAt -updatedAt');
        res.status(200).json(postCategory);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createPostCategory = async (req, res) => {

    try {
        const { title, description, creator } = req.body;

        // Validate required fields
        validateRequiredFields([
            { name: 'title', value: title },
            { name: 'description', value: description },
            { name: 'creator', value: creator }
        ]);
        // Check for duplicate title
        const postCat = await PostCategory.findOne({ title });
        if (postCat) {
            throw { 'message': 'Failed! Post category with that title already exists!', 'status': 400 };
        }
        const newPostCategory = new PostCategory({ title, description, creator });
        const savedPostCategory = await newPostCategory.save();

        if (!savedPostCategory) throw { 'status': 500, 'message': 'Could not save post category, try again!' };
        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(savedPostCategory);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updatePostCategory = async (req, res) => {
    try {
        const updatedPostCategory = await PostCategory.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedPostCategory) throw { status: 404, message: 'PostCategory not found!' };

        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(updatedPostCategory);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deletePostCategory = async (req, res) => {
    try {
        const postCategory = await PostCategory.findById(req.params.id);
        if (!postCategory) throw { status: 404, message: 'PostCategory not found!' };
        await PostCategory.findByIdAndDelete(req.params.id);
        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(postCategory);
    } catch (err) {
        handleError(res, err);
    }
};
