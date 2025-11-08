const express = require('express');
const { getRoomMessages, getOneRoomMessage, getRoomMessageByRoom, createRoomMessage, updateRoomMessage, deleteRoomMessage } = require('../controllers/room-messages');
const { auth } = require('../../../middlewares/auth.js');

const router = express.Router();

// GET routes
router.get('/', auth, getRoomMessages);
router.get('/room/:id', auth, getRoomMessageByRoom);
router.get('/:id', auth, getOneRoomMessage);

// POST routes
router.post('/', auth, createRoomMessage);

// PUT routes
router.put('/:id', auth, updateRoomMessage);

// DELETE routes
router.delete('/:id', auth, deleteRoomMessage);

module.exports = router;