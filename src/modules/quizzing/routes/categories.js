const express = require('express');
const { getCategories, getOneCategory, createCategory, updateCategory, deleteCategory } = require('../controllers/categories');
const { authRole } = require('../../middlewares/auth');

const router = express.Router();

// GET routes
router.get('/', getCategories);
router.get('/:id', getOneCategory);

// POST routes
router.post('/', authRole(['Admin', 'SuperAdmin']), createCategory);

// PUT routes
router.put('/:id', authRole(['SuperAdmin']), updateCategory);

// DELETE routes
router.delete('/:id', authRole(['SuperAdmin']), deleteCategory);

module.exports = router;