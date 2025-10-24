const express = require('express');
const { getFeedbacks, getOneFeedback, createFeedback, updateFeedback, deleteFeedback } = require('../controllers/feedbacks');
const { auth } = require('../middlewares/auth');

const router = express.Router();

// GET routes
router.get('/', getFeedbacks);
router.get('/:id', getOneFeedback);

// POST routes
router.post('/', auth, createFeedback);

// PUT routes
router.put('/:id', auth, updateFeedback);

// DELETE routes
router.delete('/:id', auth, deleteFeedback);

module.exports = router;