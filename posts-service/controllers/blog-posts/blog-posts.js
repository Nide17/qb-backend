const BlogPost = require("../../models/blog-posts/BlogPost.js");
const { handleError } = require('../../utils/error');
const { s3Config, populateBlogPost, populateBlogPosts, validateRequiredFields } = require('../../utils/helpers');

exports.getBlogPosts = async (req, res) => {

    try {
        let blogPosts = await BlogPost.find().sort({ createdAt: -1 })
            .populate('postCategory', 'title');

        if (!blogPosts || blogPosts.length === 0) {
            return res.status(204).json({
                success: false,
                error: 'No Blog Posts Found',
                message: 'No blog posts found',
                code: 'NO_POSTS_FOUND',
                timestamp: new Date().toISOString()
            });
        }

        // Populate creator data for each blog post
        blogPosts = await populateBlogPosts(res, blogPosts);
        res.status(200).json(blogPosts);
    } catch (err) {
        handleError(res, err);
    }
}

exports.getOneBlogPost = async (req, res) => {

    try {
        const id = req.params.id;
        const query = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { slug: id };

        let blogPost = await BlogPost.findOne(query)
            .populate('postCategory', 'title');

        if (!blogPost) {
            return res.status(404).json({
                success: false,
                error: 'Blog Post Not Found',
                message: 'Blog post not found',
                code: 'BLOG_POST_NOT_FOUND',
                timestamp: new Date().toISOString()
            });
        }

        // Populate creator data for the blog post
        blogPost = await populateBlogPost(res, blogPost);
        res.status(200).json({
            success: true,
            data: blogPost,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        handleError(res, err);
    }
}

exports.getBlogPostsByCategory = async (req, res) => {

    try {
        const id = req.params.id;

        if (!id) {
            return res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Category id not provided',
                code: 'MISSING_CATEGORY_ID',
                timestamp: new Date().toISOString()
            });
        }

        let blogPosts = await BlogPost.find({ postCategory: id }).sort({ createdAt: -1 })
            .populate('postCategory', 'title');

        if (!blogPosts || blogPosts.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Blog Posts Not Found For This Category',
                message: 'No blog posts found for this category',
                code: 'NO_POSTS_IN_CATEGORY',
                timestamp: new Date().toISOString()
            });
        }

        // Populate creator data for each blog post
        blogPosts = await populateBlogPosts(res, blogPosts);
        res.status(200).json(blogPosts);
    } catch (err) {
        handleError(res, err);
    }
}

exports.getCreatedBy = async (req, res) => {
    try {
        const blogPosts = await BlogPost.find({ owner: req.params.id }).sort({ createdAt: -1 });
        if (!blogPosts) return res.status(404).json({ message: 'No blogPosts found!' });
        res.status(200).json(blogPosts);
    } catch (err) {
        handleError(res, err);
    }
}

exports.createBlogPost = async (req, res) => {
    const bp_image = req.file ? req.file : null
    const { title, markdown, postCategory, creator, bgColor } = req.body

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
        })

        const savedBlogPost = await newBlogPost.save()

        if (!savedBlogPost) {
            return res.status(500).json({
                success: false,
                message: 'Something went wrong during creation! file size should not exceed 1MB'
            });
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
        })

    } catch (err) {
        handleError(res, err);
    }
}

exports.updateBlogPost = async (req, res) => {
    try {
        const blogPost = await BlogPost.findById(req.params.id);
        if (!blogPost) return res.status(404).json({ message: 'BlogPost not found!' });

        const updatedBlogPost = await BlogPost.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updatedBlogPost);
    } catch (error) {
        handleError(res, error);
    }
};

exports.updateBlogPostStatus = async (req, res) => {
    try {
        const blogPost = await BlogPost.findById(req.params.id);
        if (!blogPost) return res.status(404).json({ message: 'BlogPost not found!' });

        const updatedBlogPost = await BlogPost.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
        res.status(200).json(updatedBlogPost);
    } catch (error) {
        handleError(res, error);
    }
};

exports.deleteBlogPost = async (req, res) => {
    try {
        const blogPost = await BlogPost.findById(req.params.id)
        if (!blogPost) {
            return res.status(404).json({
                success: false,
                message: 'BlogPost is not found!'
            });
        }

        if (blogPost.post_image) {
            const params = {
                Bucket: process.env.S3_BUCKET,
                Key: blogPost.post_image.split('/').pop()
            }

            try {
                await s3Config.deleteObject(params).promise();
                console.log(params.Key + ' deleted from ' + params.Bucket);
            } catch (err) {
                console.log('ERROR in file Deleting : ' + JSON.stringify(err));
                return res.status(400).json({ message: 'Failed to delete! ' + err.message });
            }
        }

        const removedBlogPost = await blogPost.deleteOne()
        if (!removedBlogPost) {
            return res.status(500).json({
                success: false,
                message: 'Something went wrong while deleting!'
            });
        }

        res.status(200).json({ message: 'BlogPost deleted successfully!' });
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteBlogPostImage = async (req, res) => {
    try {
        const blogPost = await BlogPost.findById(req.params.id);
        if (!blogPost) return res.status(404).json({ message: 'BlogPost not found!' });

        const updatedBlogPost = await BlogPost.findByIdAndUpdate(req.params.id, { blogPost_image: '' }, { new: true });
        res.status(200).json(updatedBlogPost);
    } catch (error) {
        handleError(res, error);
    }
};
