const BlogPostsView = require('../../models/blog-posts/BlogPostsView');
const scheduledReportMessage = require('./scheduledReport');
const { handleError } = require('../../utils/error');
const { populateUser, deleteImageFromS3 } = require('../../utils/helpers');

// SCHEDULED REPORT MESSAGE
scheduledReportMessage();

exports.getBlogPostsViews = async (req, res) => {
    try {
    let blogPostsViews = await BlogPostsView.find().populate('blogPost', 'title slug').sort({ createdAt: -1 }).select('-__v');
    if (!blogPostsViews) throw {'message':'No blog Posts Views found!','statusCode':204};

        let blogPostsViewsObj = blogPostsViews.map(view => view?.toObject ? view.toObject() : view);
        blogPostsViewsObj = await Promise.all(blogPostsViewsObj?.map(async view => {
            if (view.viewer) {
                view.viewer = await populateUser(view.viewer);
            }
            return view;
        }));

        res.status(200).json(blogPostsViewsObj);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneBlogPostsView = async (req, res) => {
    try {
        let blogPostsView = await BlogPostsView.findById(req.params.id);

    if (!blogPostsView) throw {'message':'Blog Post View not found!','statusCode':404};
        res.status(200).json(blogPostsView);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getRecentTenViews = async (req, res) => {
    try {
        let recentTenViews = await BlogPostsView.find().populate('blogPost', 'title slug').sort({ createdAt: -1 }).limit(10).select('-__v');
    if (!recentTenViews) throw {'message':'10 blog posts views not found!','statusCode':404};

        let recentTenViewsObj = recentTenViews.map(view => view?.toObject ? view.toObject() : view);
        recentTenViewsObj = await Promise.all(recentTenViewsObj?.map(async view => {
            if (view.viewer) {
                view.viewer = await populateUser(view.viewer);
            }
            return view;
        }));

        res.status(200).json(recentTenViewsObj);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createBlogPostsView = async (req, res) => {
    const { blogPost, viewer, device, country } = req.body;

    if (!blogPost) {
        throw {'message':'Blog post does not exist.','statusCode':400};
    }

    try {
        const newBlogPostView = new BlogPostsView({ blogPost, viewer, device, country });
        const savedBlogPost = await newBlogPostView.save();

    if (!savedBlogPost) throw {'message':'Something went wrong during creation! File size should not exceed 1MB','statusCode':503};

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
    if (!blogPostsView) throw {'message':'BlogPostsView not found!','statusCode':404};

        const updatedBlogPostsView = await BlogPostsView.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updatedBlogPostsView);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteBlogPostsView = async (req, res) => {
    try {
        const blogPost = await BlogPostsView.findById(req.params.id);
        if (!blogPost) throw new Error('BlogPost not found!');
        blogPost.post_image && await deleteImageFromS3(blogPost.post_image);
        const removedBlogPost = await blogPost.deleteOne();

        if (removedBlogPost.deletedCount === 0) throw new Error('Something went wrong while deleting!');

        res.status(200).json(blogPost);
    } catch (err) {
        handleError(res, err);
    }
};
