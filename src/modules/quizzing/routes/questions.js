const express = require('express');
const { getQuestions, getBatchedQuestions, getOneQuestion, createQuestion, updateQuestion, deleteQuestion } = require('../controllers/questions');
const { authRole } = require('../../../middlewares/auth.js');

const router = express.Router();

// GET routes
router.get('/', getQuestions);
router.get('/:id', getOneQuestion);

// POST routes
router.post('/batch', getBatchedQuestions);
router.post('/', authRole(['Admin', 'SuperAdmin']), createQuestion);

// PUT routes
router.put('/:id', authRole(['SuperAdmin']), updateQuestion);

// DELETE routes
router.delete('/:id', authRole(['SuperAdmin']), deleteQuestion);

module.exports = router;