const express = require('express');
const { getQuestions, getOneQuestion, createQuestion, updateQuestion, deleteQuestion } = require('../controllers/questions');
const { authRole } = require('../middlewares/auth');

const router = express.Router();

// GET routes
router.get('/', getQuestions);
router.get('/:id', getOneQuestion);

// POST routes
router.post('/', authRole(['Admin', 'SuperAdmin']), createQuestion);

// PUT routes
router.put('/:id', authRole(['SuperAdmin']), updateQuestion);

// DELETE routes
router.delete('/:id', authRole(['SuperAdmin']), deleteQuestion);

module.exports = router;