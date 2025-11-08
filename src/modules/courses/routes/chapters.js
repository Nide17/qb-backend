const express = require('express');
const { getChapters, getChaptersByCourse, getOneChapter, createChapter, updateChapter, deleteChapter } = require('../controllers/chapters');
const { authRole } = require('../../middlewares/auth');

const router = express.Router();

// GET routes
router.get('/', getChapters);
router.get('/course/:id', getChaptersByCourse);
router.get('/:id', getOneChapter);

// POST routes
router.post('/', authRole(['Creator', 'Admin', 'SuperAdmin']), createChapter);

// PUT routes
router.put('/:id', authRole(['Creator', 'Admin', 'SuperAdmin']), updateChapter);

// DELETE routes
router.delete('/:id', authRole(['Creator', 'Admin', 'SuperAdmin']), deleteChapter);

module.exports = router;