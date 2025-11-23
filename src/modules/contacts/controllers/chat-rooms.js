const { getModels } = require('../../../utils/db-manager');
const { handleError } = require('../../../utils/error');
const { notifyAdmins, expandRoomsUsers } = require('../helpers');
const { validateRequiredFields, cacheManager, cacheWrapper } = require('../../../utils/global-helpers');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "crm:all",
    ONE: (id) => `crm:${id}`,
};

exports.getChatRooms = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ALL;
        const { ChatRoom } = await getModels('contacts');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            let chatRooms = await ChatRoom.find().sort({ createdAt: -1 });
            chatRooms = await expandRoomsUsers(chatRooms);
            return chatRooms;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneChatRoom = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ONE(req.params.id);
        const { ChatRoom } = await getModels('contacts');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await ChatRoom.findById(req.params.id);
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }

};

exports.createChatRoom = async (req, res) => {
    try {
        const { name, users } = req.body;

        // Validation
        validateRequiredFields([{ name: 'name', value: name }, { name: 'users', value: users }]);

        const { ChatRoom } = await getModels('contacts');

        const newRoom = new ChatRoom({ name, users });
        const savedRoom = await newRoom.save();
        if (!savedRoom) {
            throw { 'status': 500, 'message': 'Something went wrong during creation!' };
        }

        // Notify admins about the new chat room
        await notifyAdmins(savedRoom);
        await cacheManager.invalidatePattern("crm:*");
        res.status(200).json(savedRoom);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createOpenChatRoom = async (req, res) => {
    const name = req.params.roomNameToOpen;

    try {
        const { ChatRoom } = await getModels('contacts');
        let chatroom = await ChatRoom.findOne({ name });

        if (chatroom) {
            chatroom = await expandRoomsUsers([chatroom]);
            return res.status(200).json(chatroom[0]);
        }

        const { users } = req.body;
        // Validation
        validateRequiredFields([{ name: 'name', value: name }, { name: 'users', value: users }]);
        if (!Array.isArray(users)) {
            throw { message: 'Users must be an array', status: 400 };
        }

        if (users.length < 2) {
            throw { message: 'No room users provided', status: 400 };
        }

        const newRoom = new ChatRoom({ name, users });
        const savedRoom = await newRoom.save();
        if (!savedRoom) throw { status: 500, message: 'Something went wrong during creation!' };

        let createdChatroom = await ChatRoom.findById(savedRoom._id);
        createdChatroom = await expandRoomsUsers([createdChatroom]);

        // Notify admins about the new open chat room
        await notifyAdmins(createdChatroom[0]);
        await cacheManager.invalidatePattern("crm:*");
        res.status(200).json(createdChatroom[0]);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateChatRoom = async (req, res) => {
    try {
        const { ChatRoom } = await getModels('contacts');

        const updatedChatRoom = await ChatRoom.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedChatRoom) throw { message: 'Something went wrong during update!', status: 500 };
        await cacheManager.invalidatePattern("crm:*");
        res.status(200).json(updatedChatRoom);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteChatRoom = async (req, res) => {
    try {
        const { ChatRoom, RoomMessage } = await getModels('contacts');

        await RoomMessage.deleteMany({ room: req.params.id });

        const deletedChatRoom = await ChatRoom.findByIdAndDelete(req.params.id);
        if (!deletedChatRoom) throw { message: 'Something went wrong during deletion!', status: 500 };
        await cacheManager.invalidatePattern("crm:*");
        res.status(200).json(deletedChatRoom);
    } catch (err) {
        handleError(res, err);
    }
};
