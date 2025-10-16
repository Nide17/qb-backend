const BlogPostsView = require("../../models/blog-posts/BlogPostsView");
const scheduledReportMessage = require('./scheduledReport');
const { handleError } = require('../../utils/error');
const { populateUser, s3Config } = require('../../utils/helpers');

// SCHEDULED REPORT MESSAGE
scheduledReportMessage();

exports.getBlogPostsViews = async (req, res) => {
    try {
        let blogPostsViews = await BlogPostsView.find().populate('blogPost', 'title slug').sort({ createdAt: -1 }).select('-__v');
        if (!blogPostsViews) return res.status(204).json({ message: 'No blog Posts Views found!' });

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

        if (!blogPostsView) return res.status(404).json({ message: 'Blog Post View not found!' });
        res.status(200).json(blogPostsView);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getRecentTenViews = async (req, res) => {
    try {
        let recentTenViews = await BlogPostsView.find().populate('blogPost', 'title slug').sort({ createdAt: -1 }).limit(10).select('-__v');
        if (!recentTenViews) return res.status(404).json({ message: '10 blog posts views not found!' });

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
        return res.status(400).json({ message: 'Blog post does not exist.' });
    }

    try {
        const newBlogPostView = new BlogPostsView({ blogPost, viewer, device, country });
        const savedBlogPost = await newBlogPostView.save();

        if (!savedBlogPost) return res.status(503).json({ message: 'Something went wrong during creation! File size should not exceed 1MB' });

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
        if (!blogPostsView) return res.status(404).json({ message: 'BlogPostsView not found!' });

        const updatedBlogPostsView = await BlogPostsView.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updatedBlogPostsView);
    } catch (error) {
        handleError(res, error);
    }
};

exports.deleteBlogPostsView = async (req, res) => {
    try {
        const blogPost = await BlogPostsView.findById(req.params.id);
        if (!blogPost) return res.status(404).json({ message: 'BlogPost not found!' });

        if (blogPost.post_image) {
            const params = {
                Bucket: process.env.S3_BUCKET,
                Key: blogPost.post_image.split('/').pop() // if any sub folder -> path/of/the/folder.ext
            };

            try {
                await s3Config.deleteObject(params).promise();
                console.log(params.Key + ' deleted from ' + params.Bucket);
            } catch (err) {
                console.log('ERROR in file Deleting: ' + JSON.stringify(err));
                return res.status(400).json({
                    message: 'Failed to delete! ' + err.message,
                    success: false
                });
            }
        }

        const removedBlogPost = await blogPost.deleteOne();

        if (!removedBlogPost) return res.status(503).json({ message: 'Something went wrong while deleting!' });

        res.status(200).json(blogPost);
    } catch (err) {
        handleError(res, err);
    }
};
