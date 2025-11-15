const User = require('../../../users/models/User.js');
const BlogPost = require('../../models/blog-posts/BlogPost.js');
const { handleError } = require('../../../../utils/error.js');
const { deleteImageFromS3, validateRequiredFields, cacheManager, cacheWrapper } = require('../../../../utils/global-helpers.js');
const { getBatchedUsersMap } = require('../../../users/helpers.js');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "cat:all",
    ONE: (id) => `cat:${id}`,
};
exports.getBlogPosts = async (req, res) => {

    try {
        const cacheKey = 'blogPosts';

        let blogPosts = await BlogPost.find().sort({ createdAt: -1 }).populate('postCategory', 'title').lean();
        if (!blogPosts || blogPosts.length === 0) throw { 'message': 'No blog posts found', 'status': 404 };

        // Extract unique IDs
        const usersIDs = [...new Set(blogPosts.map(ch => ch.creator?.toString()))];

        // Get users details as a Map
        const usersMap = await getBatchedUsersMap(usersIDs);

        // Map blogPosts to expanded objects
        const expandedBlogPosts = blogPosts.map(bp => {
            const creator = usersMap.get(bp.creator?.toString()) || bp.creator;
            return { ...bp, creator };
        });
        blogPosts = expandedBlogPosts || blogPosts;

        res.status(200).json(blogPosts);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneBlogPost = async (req, res) => {

    try {
        const id = req.params.id;
        const query = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { slug: id };

        let blogPost = await BlogPost
            .findOne(query)
            .populate('postCategory', 'title')
            .lean();

        if (!blogPost) throw { 'message': 'Blog post not found', 'status': 404 };

        blogPost.creator = await User.findById(blogPost.creator).select('-password -__v -createdAt -updatedAt').lean();

        res.status(200).json(blogPost);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getBlogPostsByCategory = async (req, res) => {

    try {
        const id = req.params.id;

        const cacheKey = `blogPostsByCategory-${id}`;

        if (!id) {
            throw { 'message': 'Category id not provided', 'status': 400 };
        }

        let blogPosts = await BlogPost.find({ postCategory: id }).sort({ createdAt: -1 })
            .populate('postCategory', 'title').lean();

        if (!blogPosts || blogPosts.length === 0) {
            throw { 'message': 'No blog posts found for this category', 'status': 404 };
        }

        // Extract unique IDs
        const usersIDs = [...new Set(blogPosts.map(b => b.creator?.toString()))];

        // Get users details as a Map
        const usersMap = await getBatchedUsersMap(usersIDs);

        // Map blogPosts to expanded objects
        const expandedBlogPosts = blogPosts.map(bp => {
            const creator = usersMap.get(bp.creator?.toString()) || bp.creator;
            return { ...bp, creator };
        });
        blogPosts = expandedBlogPosts || blogPosts;

        res.status(200).json(blogPosts);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteBlogPost = async (req, res) => {
    try {
        const id = req.params.id;
        const blogPost = await BlogPost.findById(id);
        if (!blogPost) throw { 'message': 'Blog post not found', 'status': 404 };

        await blogPost.remove();
        await deleteImageFromS3(blogPost.post_image);

        res.status(200).json({ message: 'Blog post deleted successfully' });
    } catch (err) {
        handleError(res, err);
    }
};

exports.getCreatedBy = async (req, res) => {
    try {

        if (!req.params.id) throw { 'message': 'User id not provided', 'status': 400 };
        const cacheKey = `blogPostsByCreator-${req.params.id}`;
        const blogPosts = await BlogPost.find({ owner: req.params.id }).sort({ createdAt: -1 });
        if (!blogPosts) throw { 'message': 'No blogPosts found!', 'status': 404 };
        res.status(200).json(blogPosts);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createBlogPost = async (req, res) => {

    const bp_image = req.file ? req.file : null;
    const { title, markdown, postCategory, creator, bgColor } = req.body;

    try {
        // Validate required fields
        validateRequiredFields([
            { name: 'title', value: title },
            { name: 'markdown', value: markdown },
            { name: 'postCategory', value: postCategory },
            { name: 'creator', value: creator }
        ]);

        const newBlogPost = new BlogPost({
            title,
            post_image: bp_image && bp_image.location,
            markdown,
            postCategory,
            creator,
            bgColor
        });

        const savedBlogPost = await newBlogPost.save();
        if (!savedBlogPost) throw { 'message': 'Something went wrong during creation! file size should not exceed 1MB', 'status': 500 };


        res.status(200).json(savedBlogPost);

    } catch (err) {
        handleError(res, err);
    }
};

exports.updateBlogPost = async (req, res) => {
    try {
        const blogPost = await BlogPost.findById(req.params.id);
        if (!blogPost) throw { 'message': 'BlogPost not found!', 'status': 404 };
        const updatedBlogPost = await BlogPost.findByIdAndUpdate(req.params.id, req.body, { new: true });

        res.status(200).json(updatedBlogPost);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateBlogPostStatus = async (req, res) => {
    try {
        const blogPost = await BlogPost.findById(req.params.id);
        if (!blogPost) throw { 'message': 'BlogPost not found!', 'status': 404 };

        const updatedBlogPost = await BlogPost.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });

        res.status(200).json(updatedBlogPost);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteBlogPost = async (req, res) => {

    try {
        const blogPost = await BlogPost.findById(req.params.id);
        if (!blogPost) throw { 'message': 'BlogPost is not found!', 'status': 404 };

        blogPost.post_image && await deleteImageFromS3(blogPost.post_image);
        const removedBlogPost = await blogPost.deleteOne();

        if (removedBlogPost.deletedCount === 0) throw { 'message': 'Something went wrong while deleting!', 'status': 500 };

        res.status(200).json(blogPost);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteBlogPostImage = async (req, res) => {
    try {
        const blogPost = await BlogPost.findById(req.params.id);
        if (!blogPost) throw { 'message': 'BlogPost not found!', 'status': 404 };

        const updatedBlogPost = await BlogPost.findByIdAndUpdate(req.params.id, { blogPost_image: '' }, { new: true });
        await deleteImageFromS3(blogPost.post_image);

        res.status(200).json(updatedBlogPost);
    } catch (err) {
        handleError(res, err);
    }
};
