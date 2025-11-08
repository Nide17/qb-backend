const RoomMessage = require('../models/RoomMessage');
const { handleError } = require('../../utils/error');
const { getFromService, validateRequiredFields, notifyAdmins, validateRoomMessageData } = require('../../utils/helpers');

exports.getRoomMessages = async (req, res) => {
    try {
        let roomMessages = await RoomMessage.find().sort({ createdAt: -1 });

        // Helper function to safely fetch user data
        const fetchUser = async (userId, context) => {
            try {
                if (!userId) return null;
                const response = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users/${userId}`);
                return response;
            } catch (error) {
                console.warn(`Failed to fetch ${context} user ${userId}:`, error.message);
                return null;
            }
        };

        // Use Promise.allSettled for resilient concurrent fetching
        const userPromises = roomMessages.flatMap(roomMessage => [
            {
                message: roomMessage,
                type: 'sender',
                promise: fetchUser(roomMessage.sender, 'sender')
            },
            {
                message: roomMessage,
                type: 'receiver',
                promise: fetchUser(roomMessage.receiver, 'receiver')
            }
        ]);

        const userResults = await Promise.allSettled(userPromises.map(item => item.promise));

        // Apply results back to messages
        let resultIndex = 0;
        for (const roomMessage of roomMessages) {
            const senderResult = userResults[resultIndex++];
            const receiverResult = userResults[resultIndex++];

            roomMessage.sender = senderResult.status === 'fulfilled' ? senderResult.value : null;
            roomMessage.receiver = receiverResult.status === 'fulfilled' ? receiverResult.value : null;
        }

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

        res.status(200).json({
            _id: savedMessage._id,
            sender: savedMessage.sender,
            receiver: savedMessage.receiver,
            content: savedMessage.content,
            room: savedMessage.room,
            createdAt: savedMessage.createdAt,
            senderName,
        });
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

        res.status(200).json(roomMessage);
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
