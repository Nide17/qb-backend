const express = require('express');
const { getScores, getScoresByTaker, getScoresForQuizCreator, getOneScore, getBatchedScores, getQuizRanking, getPopularQuizzes, getMonthlyUser, getTop10QuizzingUsers, getTop10Quizzes, createScore, deleteScore } = require('../controllers/scores');
const { auth, authRole } = require('../../middlewares/auth');

const router = express.Router();

// GET routes
router.get('/', getScores);
router.get('/popular-quizzes', getPopularQuizzes);
router.get('/monthly-user', getMonthlyUser);
router.get('/top-10-quizzing-users', getTop10QuizzingUsers);
router.get('/top-10-quizzes', getTop10Quizzes);
router.get('/quiz-ranking/:id', getQuizRanking);
router.get('/quiz-creator/:id', authRole(['Creator', 'Admin', 'SuperAdmin']), getScoresForQuizCreator);
router.get('/taken-by/:id', auth, getScoresByTaker);
router.get('/:id', getOneScore);

// POST routes
router.post('/', createScore);
router.post('/batch', getBatchedScores);

// DELETE routes
router.delete('/:id', authRole(['Creator', 'Admin', 'SuperAdmin']), deleteScore);

module.exports = router;