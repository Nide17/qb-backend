const express = require('express');
const { getBlogPostsViews, getOneBlogPostsView, getRecentTenViews, createBlogPostsView, updateBlogPostsView, deleteBlogPostsView } = require('../../controllers/blog-posts/blog-posts-views');

const router = express.Router();

// GET routes
router.get('/', getBlogPostsViews);
router.get('/recent-ten-views', getRecentTenViews);
router.get('/:id', getOneBlogPostsView);

// POST routes
router.post('/', createBlogPostsView);

// PUT routes
router.put('/:id', updateBlogPostsView);

// DELETE routes
router.delete('/:id', deleteBlogPostsView);

module.exports = router;