const BlogPost = require('../../models/blog-posts/BlogPost.js');
const { handleError } = require('../../utils/error.js');
const { deleteImageFromS3, populateOneUser, populateBatchedUsers, validateRequiredFields, setCachedData, getCachedData } = require('../../utils/helpers.js');

exports.getBlogPosts = async (req, res) => {

    try {

        const cacheKey = 'blogPosts';
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);

        let blogPosts = await BlogPost.find().sort({ createdAt: -1 })
            .populate('postCategory', 'title');

        if (!blogPosts || blogPosts.length === 0) {
            throw { 'message': 'No blog posts found', 'status': 204 };
        }

        // Extract unique user IDs for better efficiency
        const usersIDs = [...new Set(blogPosts.map(ch => ch.creator?.toString()))];

        // Populate all user details in batch (assumed returns a map-like object or record)
        const batchedUsers = await populateBatchedUsers(usersIDs);

        // Map blogPosts to expanded objects
        const expandedBlogPosts = blogPosts.map(bp => {
            const bpObj = bp.toObject();
            const creator = batchedUsers.get(bp.creator?.toString()) || bp.creator;
            return { ...bpObj, creator };
        });
        blogPosts = expandedBlogPosts || blogPosts;

        await setCachedData(cacheKey, blogPosts);
        res.status(200).json(blogPosts);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneBlogPost = async (req, res) => {

    try {
        const id = req.params.id;
        const query = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { slug: id };

        let blogPost = await BlogPost.findOne(query)
            .populate('postCategory', 'title');

        if (!blogPost) {
            throw { 'message': 'Blog post not found', 'status': 404 };
        }

        // Populate creator data for the blog post (keep full post object, only replace creator)
        const blogPostObj = blogPost.toObject ? blogPost.toObject() : blogPost;
        const creator = await populateOneUser(blogPostObj.creator);
        blogPostObj.creator = creator || { _id: blogPostObj.creator, name: 'Unknown User' };

        res.status(200).json(blogPostObj);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getBlogPostsByCategory = async (req, res) => {

    try {
        const id = req.params.id;

        const cacheKey = `blogPostsByCategory-${id}`;
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);

        if (!id) {
            throw { 'message': 'Category id not provided', 'status': 400 };
        }

        let blogPosts = await BlogPost.find({ postCategory: id }).sort({ createdAt: -1 })
            .populate('postCategory', 'title');

        if (!blogPosts || blogPosts.length === 0) {
            throw { 'message': 'No blog posts found for this category', 'status': 404 };
        }

        // Extract unique user IDs for better efficiency
        const usersIDs = [...new Set(blogPosts.map(b => b.creator?.toString()))];

        // Populate all user details in batch (assumed returns a map-like object or record)
        const batchedUsers = await populateBatchedUsers(usersIDs);

        // Map blogPosts to expanded objects
        const expandedBlogPosts = blogPosts.map(bp => {
            const bpObj = bp.toObject();
            const creator = batchedUsers.get(bp.creator?.toString()) || bp.creator;
            return { ...bpObj, creator };
        });

        blogPosts = expandedBlogPosts || blogPosts;
        await setCachedData(cacheKey, blogPosts);
        res.status(200).json(blogPosts);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getCreatedBy = async (req, res) => {
    try {

        if (!req.params.id) {
            throw { 'message': 'User id not provided', 'status': 400 };
        }

        const cacheKey = `blogPostsByCreator-${req.params.id}`;
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);
        const blogPosts = await BlogPost.find({ owner: req.params.id }).sort({ createdAt: -1 });
        if (!blogPosts) throw { 'message': 'No blogPosts found!', 'status': 404 };

        await setCachedData(cacheKey, blogPosts);
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

        if (!savedBlogPost) {
            throw { 'message': 'Something went wrong during creation! file size should not exceed 1MB', 'status': 500 };
        }

        res.status(200).json({
            _id: savedBlogPost._id,
            title: savedBlogPost.title,
            post_image: savedBlogPost.post_image,
            markdown: savedBlogPost.markdown,
            postCategory: savedBlogPost.postCategory,
            creator: savedBlogPost.creator,
            bgColor: savedBlogPost.bgColor,
            slug: savedBlogPost.slug
        });

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
        res.status(200).json(updatedBlogPost);
    } catch (err) {
        handleError(res, err);
    }
};
