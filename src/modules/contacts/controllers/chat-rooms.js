const ChatRoom = require('../models/ChatRoom');
const RoomMessage = require('../models/RoomMessage');
const { handleError } = require('../../utils/error');
const { validateRequiredFields, notifyAdmins, populateUsersInChatRooms } = require('../../utils/helpers');

exports.getChatRooms = async (req, res) => {
    try {
        let chatRooms = await ChatRoom.find().sort({ createdAt: -1 });
        chatRooms = await populateUsersInChatRooms(chatRooms);
        res.status(200).json(chatRooms);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneChatRoom = async (req, res) => {
    try {
        const chatRoom = await ChatRoom.findById(req.params.id);
        res.status(200).json(chatRoom);
    } catch (err) {
        handleError(res, err);
    }

};

exports.createChatRoom = async (req, res) => {
    try {
        const { name, users } = req.body;

        // Validation
        validateRequiredFields([{ name: 'name', value: name }, { name: 'users', value: users }]);

        const newRoom = new ChatRoom({ name, users });
        const savedRoom = await newRoom.save();
        if (!savedRoom) {
            throw { 'status': 500, 'message': 'Something went wrong during creation!' };
        }

        // Notify admins about the new chat room
        await notifyAdmins(savedRoom);

        res.status(200).json({
            _id: savedRoom._id,
            name: savedRoom.name,
            users: savedRoom.users
        });
    } catch (err) {
        handleError(res, err);
    }
};

exports.createOpenChatRoom = async (req, res) => {
    const name = req.params.roomNameToOpen;

    try {
        let chatroom = await ChatRoom.findOne({ name });

        if (chatroom) {
            chatroom = await populateUsersInChatRooms([chatroom]);
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
        createdChatroom = await populateUsersInChatRooms([createdChatroom]);

        // Notify admins about the new open chat room
        await notifyAdmins(createdChatroom[0]);

        res.status(200).json(createdChatroom[0]);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateChatRoom = async (req, res) => {
    try {
        const updatedChatRoom = await ChatRoom.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updatedChatRoom);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteChatRoom = async (req, res) => {
    try {
        await RoomMessage.deleteMany({ room: req.params.id });

        const deletedChatRoom = await ChatRoom.findByIdAndDelete(req.params.id);
        res.status(200).json(deletedChatRoom);
    } catch (err) {
        handleError(res, err);
    }
};
