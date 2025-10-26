const express = require('express');
const { getQuestionsComments, getPaginatedComments, getPendingComments, getOneQuestionComment, getCommentsByQuiz, getCommentsByQuestion, createQuestionComment, approveRejectComment, deleteQuestionComment } = require('../controllers/questions-comments');
const { auth, authRole } = require('../middlewares/auth');

const router = express.Router();

// GET routes
router.get('/', getQuestionsComments);
router.get('/paginated', authRole(['Admin', 'SuperAdmin']), getPaginatedComments);
router.get('/pending', authRole(['Admin', 'SuperAdmin']), getPendingComments);
router.get('/quiz/:id', getCommentsByQuiz);
router.get('/question/:id', auth, getCommentsByQuestion);
router.get('/:id', getOneQuestionComment);

// POST routes
router.post('/', auth, createQuestionComment);

// PUT routes
router.put('/approve-reject/:id/', authRole(['Admin', 'SuperAdmin']), approveRejectComment);

// DELETE routes
router.delete('/:id', authRole(['Admin', 'SuperAdmin']), deleteQuestionComment);

module.exports = router;