const { getModels } = require('../../../../utils/db-manager');
const { handleError } = require('../../../../utils/error');
const { deleteImageFromS3, validateRequiredFields, cacheManager, cacheWrapper } = require('../../../../utils/global-helpers');
const { getBatchedUsersMap } = require('../../../users/helpers');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "bp:all",
    ONE: (id) => `bp:${id}`,
    BY_CATEGORY: (id) => `bp:category:${id}`,
    BY_CREATOR: (id) => `bp:creator:${id}`,
};

exports.getBlogPosts = async (req, res) => {

    try {
        const cacheKey = CACHE_KEYS.ALL;
        const { BlogPost } = await getModels('posts');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
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

            return blogPosts;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneBlogPost = async (req, res) => {

    try {
        const id = req.params.id;
        const cacheKey = CACHE_KEYS.ONE(id)
        const { BlogPost } = await getModels('posts');
        const { User } = await getModels('users');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const query = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { slug: id };
            let blogPost = await BlogPost
                .findOne(query)
                .populate('postCategory', 'title')
                .lean();

            if (!blogPost) throw { 'message': 'Blog post not found', 'status': 404 };

            blogPost.creator = await User.findById(blogPost.creator).select('-password -__v -createdAt -updatedAt').lean();

            return blogPost;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getBlogPostsByCategory = async (req, res) => {

    try {
        const cacheKey = CACHE_KEYS.BY_CATEGORY(req.params.id);
        const { BlogPost } = await getModels('posts');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            let blogPosts = await BlogPost.find({ postCategory: req.params.id }).sort({ createdAt: -1 })
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

            return blogPosts;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getCreatedBy = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.BY_CREATOR(req.params.id);
        const { BlogPost } = await getModels('posts');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const blogPosts = await BlogPost.find({ creator: req.params.id }).sort({ createdAt: -1 });
            if (!blogPosts || blogPosts.length === 0) {
                throw { 'message': 'No blog posts found for this creator', 'status': 404 };
            }
            return blogPosts;
        });
        res.status(200).json(data);
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
        const { BlogPost } = await getModels('posts');

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
        await cacheManager.invalidatePattern("bp:*");
        res.status(200).json(savedBlogPost);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateBlogPost = async (req, res) => {
    try {
        const { BlogPost } = await getModels('posts');
        const blogPost = await BlogPost.findById(req.params.id);
        if (!blogPost) throw { 'message': 'BlogPost not found!', 'status': 404 };

        const updatedBlogPost = await BlogPost.findByIdAndUpdate(req.params.id, req.body, { new: true });
        await cacheManager.invalidatePattern("bp:*");
        res.status(200).json(updatedBlogPost);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateBlogPostStatus = async (req, res) => {
    try {
        const { BlogPost } = await getModels('posts');
        const blogPost = await BlogPost.findById(req.params.id);
        if (!blogPost) throw { 'message': 'BlogPost not found!', 'status': 404 };

        const updatedBlogPost = await BlogPost.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
        await cacheManager.invalidatePattern("bp:*");
        res.status(200).json(updatedBlogPost);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteBlogPost = async (req, res) => {

    try {
        const { BlogPost } = await getModels('posts');
        const blogPost = await BlogPost.findById(req.params.id);
        if (!blogPost) throw { 'message': 'BlogPost is not found!', 'status': 404 };

        blogPost.post_image && await deleteImageFromS3(blogPost.post_image);
        const removedBlogPost = await blogPost.deleteOne();

        if (removedBlogPost.deletedCount === 0) throw { 'message': 'Something went wrong while deleting!', 'status': 500 };
        await cacheManager.invalidatePattern("bp:*");
        res.status(200).json(blogPost);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteBlogPostImage = async (req, res) => {
    try {
        const { BlogPost } = await getModels('posts');

        const blogPost = await BlogPost.findById(req.params.id);
        if (!blogPost) throw { 'message': 'BlogPost not found!', 'status': 404 };

        const updatedBlogPost = await BlogPost.findByIdAndUpdate(req.params.id, { blogPost_image: '' }, { new: true });
        await deleteImageFromS3(blogPost.post_image);
        await cacheManager.invalidatePattern("bp:*");
        res.status(200).json(updatedBlogPost);
    } catch (err) {
        handleError(res, err);
    }
};
