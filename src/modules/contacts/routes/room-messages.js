const express = require('express');
const { getRoomMessages, getOneRoomMessage, getRoomMessageByRoom, getBatchedRoomMessages, sendRoomMessage, updateRoomMessage, deleteRoomMessage } = require('../controllers/room-messages');
const { auth } = require('../../../middlewares/auth.js');

const router = express.Router();

// GET routes
router.get('/', auth, getRoomMessages);
router.get('/:id', auth, getOneRoomMessage);
router.get('/room/:id', auth, getRoomMessageByRoom);

// POST routes
router.post('/', sendRoomMessage);
router.post('/batched', auth, getBatchedRoomMessages);

// PUT routes
router.put('/:id', auth, updateRoomMessage);

// DELETE routes
router.delete('/:id', auth, deleteRoomMessage);

module.exports = router;