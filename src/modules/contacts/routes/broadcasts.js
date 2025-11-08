const express = require('express');
const { getBroadcasts, getOneBroadcast, createBroadcast, updateBroadcast, deleteBroadcast } = require('../controllers/broadcasts');
const { authRole } = require('../../middlewares/auth');

const router = express.Router();

// GET routes
router.get('/', authRole(['Admin', 'SuperAdmin']), getBroadcasts);
router.get('/:id', authRole(['Admin', 'SuperAdmin']), getOneBroadcast);

// POST routes
router.post('/', authRole(['Admin', 'SuperAdmin']), createBroadcast);

// PUT routes
router.put('/:id', authRole(['Admin', 'SuperAdmin']), updateBroadcast);

// DELETE routes
router.delete('/:id', authRole(['Admin', 'SuperAdmin']), deleteBroadcast);

module.exports = router;