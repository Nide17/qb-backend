const BlogPostsView = require('../../models/blog-posts/BlogPostsView');
const scheduledReportMessage = require('./scheduledReport');
const { handleError } = require('../../utils/error');
const { populateOneUser, populateBatchedUsers, deleteImageFromS3 } = require('../../utils/helpers');

// SCHEDULED REPORT MESSAGE
scheduledReportMessage();

exports.getBlogPostsViews = async (req, res) => {
    try {
        let blogPostsViews = await BlogPostsView.find().populate('blogPost', 'title slug').sort({ createdAt: -1 }).select('-__v');
        if (!blogPostsViews) throw { 'message': 'No blog Posts Views found!', 'status': 204 };

        // Extract unique user IDs for better efficiency
        const usersIDs = [...new Set(blogPostsViews.map(bv => bv.viewer?.toString()))];

        // Populate all user details in batch (assumed returns a map-like object or record)
        const batchedUsers = await populateBatchedUsers(usersIDs);

        // Map blogPostsViews to expanded objects
        const expandedBlogPostsViews = blogPostsViews.map(bpv => {
            const bpvObj = bpv.toObject();
            const viewer = batchedUsers.get(bpv.viewer?.toString()) || bpv.viewer;
            return { ...bpvObj, viewer };
        });

        return res.status(200).json(expandedBlogPostsViews || blogPostsViews);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneBlogPostsView = async (req, res) => {
    try {
        let blogPostsView = await BlogPostsView.findById(req.params.id);

        if (!blogPostsView) throw { 'message': 'Blog Post View not found!', 'status': 404 };

        // Populate user
        blogPostsView = blogPostsView.toObject ? blogPostsView.toObject() : blogPostsView;
        blogPostsView.viewer = await populateOneUser(blogPostsView.viewer);

        res.status(200).json(blogPostsView);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getRecentTenViews = async (req, res) => {
    try {
        let recentTenViews = await BlogPostsView.find().populate('blogPost', 'title slug').sort({ createdAt: -1 }).limit(10).select('-__v');
        if (!recentTenViews) throw { 'message': '10 blog posts views not found!', 'status': 404 };

        // Extract unique user IDs for better efficiency
        const usersIDs = [...new Set(recentTenViews.map(ch => ch.viewer?.toString()))];

        // Populate all user details in batch (assumed returns a map-like object or record)
        const batchedUsers = await populateBatchedUsers(usersIDs);

        // Map recentTenViews to expanded objects
        const expandedRecentTenViews = recentTenViews.map(bpv => {
            const bpvObj = bpv.toObject();
            const viewer = batchedUsers.get(bpv.viewer?.toString()) || bpv.viewer;
            return { ...bpvObj, viewer };
        });

        return res.status(200).json(expandedRecentTenViews || recentTenViews);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createBlogPostsView = async (req, res) => {
    const { blogPost, viewer, device, country } = req.body;

    if (!blogPost) {
        throw { 'message': 'Blog post does not exist.', 'status': 400 };
    }

    try {
        const newBlogPostView = new BlogPostsView({ blogPost, viewer, device, country });
        const savedBlogPost = await newBlogPostView.save();

        if (!savedBlogPost) throw { 'message': 'Something went wrong during creation! File size should not exceed 1MB', 'status': 503 };

        res.status(200).json({
            _id: savedBlogPost._id,
            blogPost: savedBlogPost.blogPost,
            viewer: savedBlogPost.viewer,
            device: savedBlogPost.device,
            country: savedBlogPost.country
        });

    } catch (err) {
        handleError(res, err);
    }
};

exports.updateBlogPostsView = async (req, res) => {
    try {
        let blogPostsView = await BlogPostsView.findById(req.params.id);
        if (!blogPostsView) throw { 'message': 'BlogPostsView not found!', 'status': 404 };

        const updatedBlogPostsView = await BlogPostsView.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updatedBlogPostsView);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteBlogPostsView = async (req, res) => {
    try {
        const blogPost = await BlogPostsView.findById(req.params.id);
        if (!blogPost) throw { 'message': 'BlogPost not found!', 'status': 404 };
        blogPost.post_image && await deleteImageFromS3(blogPost.post_image);
        const removedBlogPost = await blogPost.deleteOne();

        if (removedBlogPost.deletedCount === 0) throw { 'message': 'Something went wrong while deleting!', 'status': 500 };

        res.status(200).json(blogPost);
    } catch (err) {
        handleError(res, err);
    }
};
