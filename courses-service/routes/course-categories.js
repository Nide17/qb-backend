const express = require('express');
const { getCourseCategories, getBatchedCourseCategories, getOneCategory, createCategory, updateCategory, deleteCategory } = require('../controllers/course-categories');
const { authRole } = require('../middlewares/auth');

const router = express.Router();

// GET routes
router.get('/', getCourseCategories);
router.get('/:id', getOneCategory);

// POST routes
router.post('/', authRole(['Creator', 'Admin', 'SuperAdmin']), createCategory);
router.post('/batch', getBatchedCourseCategories);

// PUT routes
router.put('/:id', authRole(['Creator', 'Admin', 'SuperAdmin']), updateCategory);

// DELETE routes
router.delete('/:id', authRole(['Creator', 'Admin', 'SuperAdmin']), deleteCategory);

module.exports = router;