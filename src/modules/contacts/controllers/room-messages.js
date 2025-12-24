const { getModels } = require('../../../utils/db-manager');
const { handleError } = require('../../../utils/error');
const { validateRoomMessageData, createChatRoom } = require('../helpers');
const { validateRequiredFields, cacheManager, cacheWrapper } = require('../../../utils/global-helpers');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "rmsg:all",
    ONE: (id) => `rmsg:${id}`,
    BY_ROOM: (id) => `rmsg:room:${id}`,
    BATCHED: (id) => `rmsg:batched:${id}`,
};

exports.getRoomMessages = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ALL;
        const { RoomMessage } = await getModels('contacts');
        const { User } = await getModels('users');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

            const roomMessages = await RoomMessage.find().sort({ createdAt: -1 }).lean();

            // Helper function to safely fetch user data
            const fetchUser = async (id, context) => {
                try {
                    if (!id) return null;
                    const user = await User.findById(id).select('name email -_id');
                    return user;
                } catch (error) {
                    console.warn(`Failed to fetch ${context} user ${id}:`, error.message);
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
        const { RoomMessage } = await getModels('contacts');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const roomMessages = await RoomMessage.find({ room: req.params.id })
                .sort({ createdAt: 1 })
                .lean();
            return roomMessages;
        })
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getBatchedRoomMessages = async (req, res) => {
    try {
        const roomIds = req.body.roomIds;
        const cacheKey = CACHE_KEYS.BATCHED(roomIds[0]);
        const { RoomMessage } = await getModels('contacts');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const roomMessages = await RoomMessage.find({ room: { $in: roomIds } })
                .sort({ createdAt: 1 })
                .lean();

            if (!roomMessages || roomMessages.length === 0) {
                return [];
            }

            return roomMessages;
        });

        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneRoomMessage = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ONE(req.params.id);
        const { RoomMessage } = await getModels('contacts');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const roomMessage = await RoomMessage.findById(req.params.id)
                .sort({ createdAt: 1 })
                .lean();

            if (!roomMessage) throw { 'status': 404, 'message': 'Room message not found' };
            return roomMessage;
        })
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.sendRoomMessage = async (req, res) => {
    try {
        const {
            sender,
            receiver,
            content,
            roomID,
            anonymous,
        } = req.body;

        if (typeof content !== 'string' || !content.trim()) {
            return res.status(400).json({ error: 'Content cannot be empty' });
        }

        const isAnonymous = !!anonymous;
        const ADMIN_ID = process.env.ADMIN_ID;
        const ADMIN_EMAIL = process.env.EMAIL_USER;

        let room;

        const { RoomMessage, ChatRoom } = await getModels('contacts');

        if (isAnonymous) {
            validateRequiredFields([
                { name: 'anonymous.name', value: anonymous.name },
                { name: 'anonymous.email', value: anonymous.email },
            ]);

            const roomKey = [ADMIN_EMAIL, anonymous.email].sort().join('_');
            const users = [ADMIN_ID]; // Having only admin the users array

            const existingRoom = await ChatRoom.findOne({ name: roomKey });
            room = existingRoom
                ? existingRoom._id
                : (await createChatRoom({ name: roomKey, users, anonymous }))._id;
        } else {
            validateRequiredFields([{ name: 'roomID', value: roomID }]);
            room = roomID;
        }
        const message = await RoomMessage.create({
            sender: sender || null,
            receiver: receiver || ADMIN_ID,
            content,
            room,
        });

        await cacheManager.invalidatePattern(`rmsg:${room}:*`);
        return res.status(201).json(message);
    } catch (err) {
        handleError(res, err);
    }
};


// Ensure updateRoomMessage is defined
exports.updateRoomMessage = async (req, res) => {
    try {
        validateRoomMessageData(req.body);
        const { RoomMessage } = await getModels('contacts');

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
        const { RoomMessage } = await getModels('contacts');

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
