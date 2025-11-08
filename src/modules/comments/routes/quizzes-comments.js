const express = require('express');
const { getQuizzesComments, getOneQuizComment, getCommentsByQuiz, createQuizComment, approveRejectComment, deleteQuizComment } = require('../controllers/quizzes-comments');
const { auth, authRole } = require('../../middlewares/auth');

const router = express.Router();

// GET routes
router.get('/', getQuizzesComments);
router.get('/quiz/:id', getCommentsByQuiz);
router.get('/:id', getOneQuizComment);

// POST routes
router.post('/', auth, createQuizComment);

// PUT routes
router.put('/approve-reject/:id/', authRole(['Admin', 'SuperAdmin']), approveRejectComment);

// DELETE routes
router.delete('/:id', authRole(['Admin', 'SuperAdmin']), deleteQuizComment);

module.exports = router;