const { getBatchedUsersMap } = require('../../../users/helpers');
const { handleError } = require('../../../../utils/error');
const { validateRequiredFields, cacheManager, cacheWrapper } = require('../../../../utils/global-helpers');
const UserModel = require('../../../users/models/User');
const PostCategoryModel = require('../../models/blog-posts/PostCategory');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "pc:all",
    ONE: (id) => `pc:${id}`,
};

// Refactored code to use reusable utilities and align with patterns from other services.
exports.getPostCategories = async (req, res) => {
    try {
        const PostCategory = await PostCategoryModel();

        const cacheKey = CACHE_KEYS.ALL;
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const postCategories = await PostCategory.find().sort({ createdAt: -1 }).lean();
            if (!postCategories || postCategories.length === 0) throw { 'status': 404, 'message': 'No postCategories found!' };

            // Extract unique IDs
            const usersIDs = [...new Set(postCategories.map(ch => ch.creator?.toString()))];

            // Get users details as a Map
            const usersMap = await getBatchedUsersMap(usersIDs);

            // Map postCategories to expanded objects
            const expandedPostCategories = postCategories.map(pc => {
                const expandedPostCategory = { ...pc };
                if (pc.creator) {
                    expandedPostCategory.creator = usersMap.get(pc.creator.toString());
                }
                return expandedPostCategory;
            });
            const result = expandedPostCategories || postCategories;
            return result;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOnePostCategory = async (req, res) => {

    try {
        const cacheKey = CACHE_KEYS.ONE(req.params.id)
        const PostCategory = await PostCategoryModel();
        const User = await UserModel();

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            let postCategory = await PostCategory.findById(req.params.id).lean();
            if (!postCategory) throw { status: 404, message: 'Image upload not found!' };

            if (postCategory.creator) {
                postCategory.creator = await User.findById(postCategory.creator).select('-password -__v -createdAt -updatedAt');
            }

            return postCategory;
        });
        res.status(200).json(data);
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

        const PostCategory = await PostCategoryModel();

        // Check for duplicate title
        const postCat = await PostCategory.findOne({ title });
        if (postCat) {
            throw { 'message': 'Failed! Post category with that title already exists!', 'status': 400 };
        }
        const newPostCategory = new PostCategory({ title, description, creator });
        const savedPostCategory = await newPostCategory.save();

        if (!savedPostCategory) throw { 'status': 500, 'message': 'Could not save post category, try again!' };
        await cacheManager.invalidatePattern("pc:*");
        res.status(200).json(savedPostCategory);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updatePostCategory = async (req, res) => {
    try {
        const PostCategory = await PostCategoryModel();

        const updatedPostCategory = await PostCategory.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedPostCategory) throw { status: 404, message: 'PostCategory not found!' };
        await cacheManager.invalidatePattern("pc:*");
        res.status(200).json(updatedPostCategory);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deletePostCategory = async (req, res) => {
    try {
        const PostCategory = await PostCategoryModel();

        const postCategory = await PostCategory.findById(req.params.id);
        if (!postCategory) throw { status: 404, message: 'PostCategory not found!' };
        await PostCategory.findByIdAndDelete(req.params.id);
        await cacheManager.invalidatePattern("pc:*");
        res.status(200).json(postCategory);
    } catch (err) {
        handleError(res, err);
    }
};
