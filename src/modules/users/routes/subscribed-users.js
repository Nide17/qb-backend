const express = require('express');
const { getSubscribedUsers, getOneSubscribedUser, createSubscribedUser, updateSubscribedUser, deleteSubscribedUser } = require('../controllers/subscribed-users');
const { authRole } = require('../middlewares/auth');

const router = express.Router();

// GET routes
router.get('/', getSubscribedUsers);
router.get('/:id', authRole(['Admin', 'SuperAdmin']), getOneSubscribedUser);

// POST routes
router.post('/', createSubscribedUser);

// PUT routes
router.put('/:id', authRole(['SuperAdmin']), updateSubscribedUser);

// DELETE routes
router.delete('/:id', authRole(['SuperAdmin']), deleteSubscribedUser);

module.exports = router;