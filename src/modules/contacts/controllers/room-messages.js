const RoomMessage = require('../models/RoomMessage');
const User = require('../../users/models/User');
const { handleError } = require('../../../utils/error');
const { notifyAdmins, validateRoomMessageData } = require('../helpers');
const { validateRequiredFields, redisCache, getCachedData, setCachedData } = require('../../../utils/global-helpers');

const keysToClear = new Set();
exports.getRoomMessages = async (req, res) => {
    try {
        const cacheKey = 'room_messages_all';
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);

        let roomMessages = await RoomMessage.find().sort({ createdAt: -1 });

        // Helper function to safely fetch user data
        const fetchUser = async (userId, context) => {
            try {
                if (!userId) return null;
                const user = await User.findById(userId).select('name email -_id');
                return user;
            } catch (error) {
                console.warn(`Failed to fetch ${context} user ${userId}:`, error.message);
                return null;
            }
        };

        // Refactored concurrent fetching with error handling
        await Promise.all(roomMessages.map(async (roomMessage) => {
            roomMessage.sender = await fetchUser(roomMessage.sender, 'sender');
            roomMessage.receiver = await fetchUser(roomMessage.receiver, 'receiver');
        }));

        await setCachedData(cacheKey, roomMessages) && keysToClear.add(cacheKey);
        res.status(200).json(roomMessages);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getRoomMessageByRoom = async (req, res) => {
    try {
        const roomMessages = await RoomMessage.find({ room: req.params.id });
        res.status(200).json(roomMessages);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneRoomMessage = async (req, res) => {
    try {
        const roomMessage = await RoomMessage.findById(req.params.id);
        if (roomMessage) res.status(200).json(roomMessage);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createRoomMessage = async (req, res) => {
    try {
        const { senderID, senderName, receiverID, content, roomID } = req.body;

        // Validation
        validateRequiredFields([
            { name: 'senderID', value: senderID },
            { name: 'receiverID', value: receiverID },
            { name: 'content', value: content },
            { name: 'roomID', value: roomID }
        ]);

        const newRoomMessage = new RoomMessage({
            sender: senderID,
            receiver: receiverID,
            content,
            room: roomID
        });

        const savedMessage = await newRoomMessage.save();
        if (!savedMessage) {
            throw { 'status': 500, 'message': 'Something went wrong during creation!' };
        }

        // Notify admins about the new room message
        await notifyAdmins(newRoomMessage);

        const result = {
            _id: savedMessage._id,
            sender: savedMessage.sender,
            receiver: savedMessage.receiver,
            content: savedMessage.content,
            room: savedMessage.room,
            createdAt: savedMessage.createdAt,
            senderName,
        };
        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(result);
    } catch (err) {
        handleError(res, err);
    }
};

// Ensure updateRoomMessage is defined
exports.updateRoomMessage = async (req, res) => {
    try {
        validateRoomMessageData(req.body);

        const updatedRoomMessage = await RoomMessage.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedRoomMessage) throw { message: 'Something went wrong during update!', status: 500 };

        res.status(200).json(updatedRoomMessage);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteRoomMessage = async (req, res) => {
    try {
        const roomMessage = await RoomMessage.findById(req.params.id);
        if (!roomMessage) return;

        const deletedMessage = await RoomMessage.findByIdAndDelete(req.params.id);
        if (!deletedMessage) throw { message: 'Something went wrong during deletion!', status: 500 };

        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(roomMessage);
    } catch (err) {
        handleError(res, err);
    }
};
