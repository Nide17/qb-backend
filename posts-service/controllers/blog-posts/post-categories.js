const PostCategory = require('../../models/blog-posts/PostCategory');
const { handleError } = require('../../utils/error');
const { populateOneUser, validateRequiredFields } = require('../../utils/helpers');

// Refactored code to use reusable utilities and align with patterns from other services.
exports.getPostCategories = async (req, res) => {
    try {
        const postCategories = await PostCategory.find().sort({ createdAt: -1 });
        if (!postCategories || postCategories.length === 0) throw { 'status': 204, 'message': 'No postCategories found!' };

        // Extract unique user IDs for better efficiency
        const usersIDs = [...new Set(postCategories.map(ch => ch.creator?.toString()))];

        // Populate all user details in batch (assumed returns a map-like object or record)
        const batchedUsers = await populateBatchedUsers(usersIDs);

        // Map postCategories to expanded objects
        const expandedPostCategories = postCategories.map(pc => {
            const pcObj = pc.toObject();
            const creator = batchedUsers.get(pc.creator?.toString()) || pc.creator;
            return { ...pcObj, creator };
        });

        return res.status(200).json(expandedPostCategories || postCategories);

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
        postCategory.creator = await populateOneUser(postCategory.creator);
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
        res.status(200).json(savedPostCategory);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updatePostCategory = async (req, res) => {
    try {
        const updatedPostCategory = await PostCategory.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedPostCategory) throw { status: 404, message: 'PostCategory not found!' };

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
        res.status(200).json(postCategory);
    } catch (err) {
        handleError(res, err);
    }
};
