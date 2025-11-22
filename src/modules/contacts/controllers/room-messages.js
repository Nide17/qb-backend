const RoomMessageModel = require('../models/RoomMessage');
const UserModel = require('../../users/models/User');
const { handleError } = require('../../../utils/error');
const { notifyAdmins, validateRoomMessageData } = require('../helpers');
const { validateRequiredFields, cacheManager, cacheWrapper } = require('../../../utils/global-helpers');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "rmsg:all",
    ONE: (id) => `rmsg:${id}`,
    BY_ROOM: (id) => `rmsg:room:${id}`
};

exports.getRoomMessages = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ALL;
        const RoomMessage = await RoomMessageModel();
        const User = await UserModel();

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

            const roomMessages = await RoomMessage.find().sort({ createdAt: -1 }).lean();

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
            return roomMessages;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getRoomMessageByRoom = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.BY_ROOM(req.params.id);
        const RoomMessage = await RoomMessageModel();

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const roomMessages = await RoomMessage.find({ room: req.params.id });
            return roomMessages;
        })
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneRoomMessage = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ONE(req.params.id);
        const RoomMessage = await RoomMessageModel();

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const roomMessage = await RoomMessage.findById(req.params.id);
            return roomMessage;
        })
        res.status(200).json(data);
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

        const RoomMessage = await RoomMessageModel();

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
        await cacheManager.invalidatePattern("rmsg:*");
        const result = {
            ...savedMessage,
            senderName,
        };
        res.status(200).json(result);
    } catch (err) {
        handleError(res, err);
    }
};

// Ensure updateRoomMessage is defined
exports.updateRoomMessage = async (req, res) => {
    try {
        validateRoomMessageData(req.body);
        const RoomMessage = await RoomMessageModel();

        const updatedRoomMessage = await RoomMessage.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedRoomMessage) throw { message: 'Something went wrong during update!', status: 500 };
        await cacheManager.invalidatePattern("rmsg:*");
        res.status(200).json(updatedRoomMessage);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteRoomMessage = async (req, res) => {
    try {
        const RoomMessage = await RoomMessageModel();

        const roomMessage = await RoomMessage.findById(req.params.id);
        if (!roomMessage) return;

        const deletedMessage = await RoomMessage.findByIdAndDelete(req.params.id);
        if (!deletedMessage) throw { message: 'Something went wrong during deletion!', status: 500 };
        await cacheManager.invalidatePattern("rmsg:*");
        res.status(200).json(roomMessage);
    } catch (err) {
        handleError(res, err);
    }
};
