const PostCategory = require('../../models/blog-posts/PostCategory');
const { handleError } = require('../../utils/error');
const { findPostCategoryById, populateUser, validateRequiredFields } = require('../../utils/helpers');

// Refactored code to use reusable utilities and align with patterns from other services.
exports.getPostCategories = async (req, res) => {
    try {
        const postCategories = await PostCategory.find().sort({ createdAt: -1 });
        if (!postCategories || postCategories.length === 0) throw {'statusCode':204,'message':'No postCategories found!'};

        // Populate creator field for each post category
        let populatedCategories = await Promise.all(
            postCategories.map(async (category) => {
                let creator = await populateUser(category.creator) || category.creator;
                return { ...category.toObject(), creator };
            })
        ) || postCategories;
        res.status(200).json(populatedCategories);

    } catch (err) {
        handleError(res, err);
    }
};

exports.getOnePostCategory = async (req, res) => {
    try {
        const postCategory = await findPostCategoryById(req.params.id);
        res.status(200).json(postCategory);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createPostCategory = async (req, res) => {

    try {
        const { title, answer, created_by } = req.body;

        // Validate required fields
        validateRequiredFields([
            { name: 'title', value: title },
            { name: 'answer', value: answer },
            { name: 'created_by', value: created_by }
        ]);
        // Check for duplicate title
        const postCat = await PostCategory.findOne({ title });
        if (postCat) {
            throw {'message':'Failed! Post category with that title already exists!','statusCode':400};
        }
        const newPostCategory = new PostCategory({ title, answer, created_by });
        const savedPostCategory = await newPostCategory.save().catch(() => {
            throw new Error('Could not save post category, try again!');
        });
        if (!savedPostCategory) throw {'statusCode':500,'message':'Could not save post category, try again!'};
        res.status(200).json(savedPostCategory);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updatePostCategory = async (req, res) => {
    try {
        const updatedPostCategory = await PostCategory.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedPostCategory) throw { statusCode: 404, message: 'PostCategory not found!' };

        res.status(200).json(updatedPostCategory);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deletePostCategory = async (req, res) => {
    try {
        const postCategory = await findPostCategoryById(req.params.id);

        const removedPostCategory = await PostCategory.findByIdAndDelete(req.params.id);
        if (!removedPostCategory) throw { statusCode: 404, message: 'PostCategory not found!' };
        res.status(200).json(postCategory);
    } catch (err) {
        handleError(res, err);
    }
};
