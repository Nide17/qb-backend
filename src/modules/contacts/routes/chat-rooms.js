const express = require('express');
const { getChatRooms, createOpenChatRoom, getOneChatRoom, createChatRoom, updateChatRoom, deleteChatRoom } = require('../controllers/chat-rooms');
const { auth, authRole } = require('../../middlewares/auth');

const router = express.Router();

// GET routes
router.get('/', auth, getChatRooms);
router.get('/:id', auth, getOneChatRoom);

// POST routes
router.post('/', auth, createChatRoom);
router.post('/room/:roomToOpen', auth, createOpenChatRoom);

// PUT routes
router.put('/:id', auth, updateChatRoom);

// DELETE routes
router.delete('/:id', authRole(['Admin', 'SuperAdmin']), deleteChatRoom);

module.exports = router;