const express = require('express');
const { getFaqs, getOneFaq, createFaq, getCreatedBy, updateFaq, addFaqVidLink, deleteFaq, deleteFaqVideo } = require('../controllers/faqs');
const { authRole } = require('../../../middlewares/auth.js');

const router = express.Router();

// GET routes
router.get('/', getFaqs);
router.get('/created-by/:id', getCreatedBy);
router.get('/:id', getOneFaq);

// POST routes
router.post('/', createFaq);
// PUT routes
router.put('/:id', authRole(['Admin', 'SuperAdmin']), updateFaq);
router.put('/add-video/:id', authRole(['Admin', 'SuperAdmin']), addFaqVidLink);

// DELETE routes
router.delete('/:id', authRole(['Admin', 'SuperAdmin']), deleteFaq);
router.delete('/delete-video/:id', authRole(['Admin', 'SuperAdmin']), deleteFaqVideo);

module.exports = router;