const { getModels } = require('../../../../utils/db-manager');
const { scheduledReportMessage } = require('../../helpers');
const { getBatchedUsersMap } = require('../../../users/helpers');
const { deleteImageFromS3, cacheManager, cacheWrapper } = require('../../../../utils/global-helpers');
const { handleError } = require('../../../../utils/error');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "bpv:all",
    ONE: (id) => `bpv:${id}`,
    RECENT_TEN: "bpv:recentTen",
};

// SCHEDULED REPORT MESSAGE
scheduledReportMessage();

exports.getBlogPostsViews = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ALL;
        const { BlogPostsView } = await getModels('posts');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            // Extract unique IDs
            let blogPostsViews = await BlogPostsView.find().populate('blogPost', 'title slug').sort({ createdAt: -1 }).select('-__v');
            if (!blogPostsViews) throw { 'message': 'No blog Posts Views found!', 'status': 404 };
            const usersIDs = [...new Set(blogPostsViews.map(bv => bv.viewer?.toString()))];

            // Get users details as a Map
            const usersMap = await getBatchedUsersMap(usersIDs);

            // Map blogPostsViews to expanded objects
            const expandedBlogPostsViews = blogPostsViews.map(bpv => {
                const viewer = usersMap.get(bpv.viewer?.toString()) || bpv.viewer;
                return { ...bpv, viewer };
            });
            const result = expandedBlogPostsViews || blogPostsViews;
            return result;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneBlogPostsView = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ONE(req.params.id)
        const { BlogPostsView } = await getModels('posts');
        const { User } = await getModels('users');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            let blogPostsView = await BlogPostsView.findById(req.params.id).lean();
            if (!blogPostsView) throw { 'message': 'Blog Post View not found!', 'status': 404 };

            if (blogPostsView.viewer) {
                blogPostsView.viewer = await User.findById(blogPostsView.viewer).select('name email');
            }

            return blogPostsView;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getRecentTenViews = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.RECENT_TEN;
        const { BlogPostsView } = await getModels('posts');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            let recentTenViews = await BlogPostsView.find().populate('blogPost', 'title slug').sort({ createdAt: -1 }).limit(10).select('-__v').lean();
            if (!recentTenViews) throw { 'message': '10 blog posts views not found!', 'status': 404 };

            // Extract unique IDs
            const usersIDs = [...new Set(recentTenViews.map(ch => ch.viewer?.toString()))];
            const usersMap = await getBatchedUsersMap(usersIDs);

            // Map recentTenViews to expanded objects
            const expandedRecentTenViews = recentTenViews.map(bpv => {
                const viewer = usersMap.get(bpv.viewer?.toString()) || bpv.viewer;
                return { ...bpv, viewer };
            });
            const result = expandedRecentTenViews || recentTenViews;
            return result;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createBlogPostsView = async (req, res) => {

    const { blogPost, viewer, device, country } = req.body;
    if (!blogPost) throw { 'message': 'Cannot create view. Blog post does not exist.', 'status': 400 };

    try {
        const { BlogPostsView } = await getModels('posts');

        const newBlogPostView = new BlogPostsView({ blogPost, viewer, device, country });
        const savedBlogPost = await newBlogPostView.save();
        if (!savedBlogPost) throw { 'message': 'Something went wrong during creation! File size should not exceed 1MB', 'status': 503 };
        await cacheManager.invalidatePattern("bpv:*");
        res.status(200).json(savedBlogPost);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateBlogPostsView = async (req, res) => {
    try {
        const { BlogPostsView } = await getModels('posts');

        let blogPostsView = await BlogPostsView.findById(req.params.id);
        if (!blogPostsView) throw { 'message': 'BlogPostsView not found!', 'status': 404 };
        const updatedBlogPostsView = await BlogPostsView.findByIdAndUpdate(req.params.id, req.body, { new: true });
        await cacheManager.invalidatePattern("bpv:*");
        res.status(200).json(updatedBlogPostsView);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteBlogPostsView = async (req, res) => {
    try {
        const { BlogPostsView } = await getModels('posts');

        const blogPost = await BlogPostsView.findById(req.params.id);
        if (!blogPost) throw { 'message': 'BlogPost not found!', 'status': 404 };
        blogPost.post_image && await deleteImageFromS3(blogPost.post_image);
        const removedBlogPost = await blogPost.deleteOne();
        if (removedBlogPost.deletedCount === 0) throw { 'message': 'Something went wrong while deleting!', 'status': 500 };
        await cacheManager.invalidatePattern("bpv:*");
        res.status(200).json(blogPost);
    } catch (err) {
        handleError(res, err);
    }
};
