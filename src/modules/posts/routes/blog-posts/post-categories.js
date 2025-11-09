const express = require('express');
const { getPostCategories, getOnePostCategory, createPostCategory, updatePostCategory, deletePostCategory } = require('../../controllers/blog-posts/post-categories');
const { authRole } = require('../../../../middlewares/auth');

const router = express.Router();

// GET routes
router.get('/', getPostCategories);
router.get('/:id', getOnePostCategory);

// POST routes
router.post('/', authRole(['Creator', 'Admin', 'SuperAdmin']), createPostCategory);

// PUT routes
router.put('/:id', authRole(['Creator', 'Admin', 'SuperAdmin']), updatePostCategory);

// DELETE routes
router.delete('/:id', authRole(['Creator', 'Admin', 'SuperAdmin']), deletePostCategory);

module.exports = router;