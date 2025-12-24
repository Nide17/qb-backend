const { getModels } = require('../../utils/db-manager');
const { getBatchedUsersMap } = require('../users/helpers');
const { sendEmail } = require('../../utils/emails/sendEmail');
const { validateRequiredFields } = require('../../utils/global-helpers');

// Helper function to send emails
const sendEmails = (recipients, title, message, clientURL) => {
    recipients.forEach((recipient, index) => {
        setTimeout(() => {
            sendEmail(
                recipient.email,
                title,
                {
                    name: recipient.name,
                    message: message,
                    unsubscribeLink: `${clientURL}/unsubscribe`
                },
                './template/broadcast.handlebars'
            );
        }, 2000 * index);
    });
};

const notifyAdmins = async (newContact) => {
    try {
        const fetchAdminEmails = async () => {
            try {
                const { User } = await getModels('users');
                const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] } }).select('email');
                if (!admins) throw { 'message': 'No admins found!', 'status': 404 };
                const adminEmails = admins.map(admin => admin.email);

                // Set cache
                return adminEmails;
            } catch (error) {
                console.warn('Failed to fetch admin emails:', error.message);
                return null;
            }
        };

        const adminEmails = await fetchAdminEmails();
        if (!adminEmails) return;

        const emailPromises = adminEmails.map((email) =>
            sendEmail(email, 'New Contact Notification', { contact: newContact }, './template/contact.handlebars')
        );
        await Promise.all(emailPromises);
    } catch (err) {
        console.error('Error notifying admins:', err.message);
    }
};

// Lightweight validator for room message payloads used by room-messages controller
const validateRoomMessageData = (data) => {
    if (!data) throw { message: 'No data provided', status: 400 };
    const required = ['sender', 'receiver', 'content', 'room'];
    required.forEach((key) => {
        if (!data[key]) throw { message: `Missing required field: ${key}`, status: 400 };
    });
    return true;
};

// Helper function to expand users in chat rooms
const expandRoomsUsers = async (chatRooms) => {

    const ids = chatRooms.map(room => room.users).flat();
    const usersIDs = [...new Set(ids)].filter(id => id);

    try {
        if (usersIDs.length > 0) {
            const usersMap = await getBatchedUsersMap(usersIDs);
            chatRooms.forEach(room => {
                room.users = room.users.map(id => usersMap.get(id.toString()));
            });
        } else {
            chatRooms.forEach(room => {
                room.users = [];
            });
        }
        return chatRooms;
    } catch (error) {
        console.log(error.name);
        return chatRooms;
    }
};

const expandOneRoomUsers = async (chatRoom) => {

    const usersIDs = [...new Set(chatRoom.users)].filter(id => id);
    
    try {
        if (usersIDs.length > 0) {
            const usersMap = await getBatchedUsersMap(usersIDs);
            chatRoom.users = chatRoom.users.map(id => usersMap.get(id.toString()));
        } else {
            chatRoom.users = [];
        }
        return chatRoom;
    } catch (error) {
        console.log(error.name);
        return chatRoom;
    }
};

const createChatRoom = async ({ name, users = [], anonymous = false }) => {
    
    const { ChatRoom } = await getModels('contacts');

    validateRequiredFields([
        { name: 'name', value: name }
    ]);

    if (!anonymous) {
        if (!Array.isArray(users) || users.length < 2) {
            const error = new Error('Room must contain at least two users');
            error.status = 400;
            throw error;
        }
    }

    const roomPayload = anonymous
        ? { name, users, anonymous }
        : { name, users };

    const room = await ChatRoom.create(roomPayload);

    if (!room) {
        const error = new Error('Failed to create chat room');
        error.status = 500;
        throw error;
    }

    return room;
};

module.exports = {
    notifyAdmins,
    sendEmails,
    validateRoomMessageData,
    expandRoomsUsers,
    expandOneRoomUsers,
    createChatRoom,
};
