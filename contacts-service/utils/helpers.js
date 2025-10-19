const axios = require('axios');
const { sendEmail } = require("../utils/emails/sendEmail");
const Broadcast = require("../models/Broadcast");
const Contact = require("../models/Contact");
const RoomMessage = require("../models/RoomMessage");
const ChatRoom = require("../models/ChatRoom");

// Simple population function for users
const populateUser = async (userId) => {
    if (!userId) return null;
    const data = await callService(`${process.env.USERS_SERVICE_URL}/api/users/${userId}`);

    return data ? {
        _id: data._id,
        name: data.name
    } : { _id: userId, name: 'Unknown User' };
};

// Helper function to find Broadcast By Id
const findBroadcastById = async (id, res, selectFields = '') => {
    try {
        const broadcast = await Broadcast.findById(id).select(selectFields);
        if (!broadcast) return res.status(404).json({ message: 'Broadcast not found!' });

        // Populate sent_by details
        let broadcastObj = broadcast.toObject ? broadcast.toObject() : broadcast;
        if (broadcast.sent_by) {
            const userData = await populateUser(broadcast.sent_by);
            if (userData) {
                broadcastObj.sent_by = { _id: userData._id, name: userData.name };
            }
        }
        return broadcastObj;
    } catch (err) {
        console.error('Error finding Broadcast by ID:', err);
        throw err;
    }
};

// Helper function to find Contact By Id
const findContactById = async (id, res, selectFields = '') => {
    try {
        const contact = await Contact.findById(id).select(selectFields);
        if (!contact) return res.status(404).json({ message: 'Contact not found!' });
        return contact;
    } catch (err) {
        console.error('Error finding Contact by ID:', err);
        throw err;
    }
};

// Helper function to find ChatRoom By Id
const findChatRoomById = async (id, res, selectFields = '') => {
    try {
        const chatRoom = await ChatRoom.findById(id).select(selectFields);
        if (!chatRoom) return res.status(404).json({ message: 'Chat Room not found!' });
        return chatRoom;
    } catch (err) {
        console.error('Error finding ChatRoom by ID:', err);
        throw err;
    }
};

// Helper function to find RoomMessage By Id
const findRoomMessageById = async (id, res, selectFields = '') => {
    try {
        const roomMessage = await RoomMessage.findById(id).select(selectFields);
        if (!roomMessage) return res.status(404).json({ message: 'Room Message not found!' });

        // Populate sender, receiver, and room details
        let roomMessageObj = roomMessage.toObject ? roomMessage.toObject() : roomMessage;
        if (roomMessage.sender) {
            const userData = await populateUser(roomMessage.sender);
            if (userData) {
                roomMessageObj.sender = { _id: userData._id, name: userData.name };
            }
        }
        if (roomMessage.receiver) {
            const userData = await populateUser(roomMessage.receiver);
            if (userData) {
                roomMessageObj.receiver = { _id: userData._id, name: userData.name };
            }
        }
        if (roomMessage.room) {
            const roomData = await callService(`${process.env.CONTACTS_SERVICE_URL}/api/chat-rooms/${roomMessage.room}`);
            roomMessageObj.room = roomData ? { _id: roomData._id, name: roomData.name } : { _id: roomMessage.room, name: 'Unknown Room' };
        }
        return roomMessageObj;
    } catch (err) {
        console.error('Error finding RoomMessage by ID:', err);
        throw err;
    }
};

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
                "./template/broadcast.handlebars"
            );
        }, 2000 * index);
    });
};

const notifyAdmins = async (newContact) => {
    try {
        const fetchAdminEmails = async () => {
            try {
                const response = await axios.get(`${process.env.USERS_SERVICE_URL}/api/users/admins-emails`);
                return response.data;
            } catch (error) {
                console.warn(`Failed to fetch admin emails:`, error.message);
                return new Promise((resolve) => {
                    setTimeout(async () => {
                        try {
                            const retryResponse = await axios.get(`${process.env.USERS_SERVICE_URL}/api/users/admins-emails`);
                            resolve(retryResponse.data);
                        } catch (retryError) {
                            console.warn(`Retry failed to fetch admin emails:`, retryError.message);
                            resolve(null);
                        }
                    }, 60000);
                });
            }
        };

        const adminEmails = await fetchAdminEmails();
        if (!adminEmails) return;

        const emailPromises = adminEmails.map((email) =>
            sendEmail(email, 'New Contact Notification', { contact: newContact }, './template/contact-notification.handlebars')
        );
        await Promise.all(emailPromises);
    } catch (err) {
        console.error('Error notifying admins:', err.message);
    }
};

// Generalized helper function to validate required fields
const validateRequiredFields = (fields) => {
    for (const field of fields) {
        if (!field.value) {
            throw new Error(`Missing required field: ${field.name}`);
        }
    }
};

// Helper function to populate users in chat rooms
const populateUsersInChatRooms = async (chatRooms) => {
    const userIds = chatRooms.map(room => room.users).flat();
    const uniqueUserIds = [...new Set(userIds)].filter(id => id);

    try {
        const userResults = await Promise.allSettled(
            uniqueUserIds.map(async (userId) => {
                if (!userId) return null;
                const response = await callService(`${process.env.USERS_SERVICE_URL}/api/users/${userId}`);
                return response;
            })
        );

        const usersResponse = userResults
            .filter(result => result.status === 'fulfilled' && result.value)
            .map(result => result.value);

        const usersMap = usersResponse.reduce((acc, user) => {
            acc[user._id] = user;
            return acc;
        }, {});

        chatRooms.forEach(room => {
            room.users = room.users.map(userId => usersMap[userId]);
        });

        return chatRooms;
    } catch (error) {
        console.log('Error populating users in chat rooms:', error.message);
        return chatRooms;
    }
};

const allowList = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:5000',
    'https://www.quizblog.rw',
    'https://www.quizblog.online',
]

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowList.includes(origin)) {
            callback(null, true)
        } else {
            console.log(origin + ' is not allowed by CORS')
            callback(new Error('Not allowed by CORS'))
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    preflightContinue: false,
    optionsSuccessStatus: 200,
    maxAge: 3600
}

module.exports = {
    notifyAdmins,
    sendEmails,
    findBroadcastById,
    findContactById,
    findChatRoomById,
    findRoomMessageById,
    validateRequiredFields,
    populateUsersInChatRooms,
    corsOptions,
};
