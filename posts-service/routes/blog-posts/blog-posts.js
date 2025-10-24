const express = require('express');
const { getBlogPosts, getOneBlogPost, getBlogPostsByCategory, createBlogPost, updateBlogPost, deleteBlogPost } = require('../../controllers/blog-posts/blog-posts');
const { authRole } = require('../../middlewares/auth');
const { blogPostUpload } = require('../../middlewares/blogPostUpload');

const router = express.Router();

// GET routes
router.get('/', getBlogPosts);
router.get('/post-category/:id', getBlogPostsByCategory);
router.get('/:id', getOneBlogPost);  // Special case - handles both slug and ObjectId

// POST routes
router.post('/', authRole(['Creator', 'Admin', 'SuperAdmin']), blogPostUpload.single('post_image'), createBlogPost);

// PUT routes
router.put('/:id', authRole(['Creator', 'Admin', 'SuperAdmin']), updateBlogPost);

// DELETE routes
router.delete('/:id', authRole(['Creator', 'Admin', 'SuperAdmin']), deleteBlogPost);

module.exports = router;