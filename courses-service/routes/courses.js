const express = require('express');
const { getCourses, getCoursesByCategory, getOneCourse, createCourse, updateCourse, deleteCourse } = require('../controllers/courses');
const { authRole } = require('../middlewares/auth');

const router = express.Router();

// GET routes
router.get('/', getCourses);
router.get('/category/:id', getCoursesByCategory);
router.get('/:id', getOneCourse);

// POST routes
router.post('/', authRole(['Creator', 'Admin', 'SuperAdmin']), createCourse);

// PUT routes
router.put('/:id', authRole(['Creator', 'Admin', 'SuperAdmin']), updateCourse);

// DELETE routes
router.delete('/:id', authRole(['Creator', 'Admin', 'SuperAdmin']), deleteCourse);

module.exports = router;