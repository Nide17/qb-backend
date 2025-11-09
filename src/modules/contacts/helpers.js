const User = require('../users/models/User');
const { getBatchedUsersMap } = require('../users/helpers');
const { sendEmail } = require('../../utils/emails/sendEmail');
const { getCachedData, setCachedData } = require('../../utils/global-helpers');

const keysToClear = new Set();
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
                const cacheKey = `admins-emails`;

                // Check cache first
                const cached = await getCachedData(cacheKey);
                if (cached) return res.status(200).json(cached);

                const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] } }).select('email');
                if (!admins) throw { 'message': 'No admins found!', 'status': 404 };
                const adminEmails = admins.map(admin => admin.email);

                // Set cache
                setCachedData(cacheKey, adminEmails) && keysToClear.add(cacheKey);
                return adminEmails;
            } catch (error) {
                console.warn('Failed to fetch admin emails:', error.message);
                return null;
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

// Lightweight validator for room message payloads used by room-messages controller
const validateRoomMessageData = (data) => {
    if (!data) throw { message: 'No data provided', status: 400 };
    const required = ['senderID', 'receiverID', 'content', 'roomID'];
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
                room.users = room.users.map(userId => usersMap[userId]);
            });
        } else {
            chatRooms.forEach(room => {
                room.users = [];
            });
        }
        return chatRooms;
    } catch (error) {
        return chatRooms;
    }
};

module.exports = {
    notifyAdmins,
    sendEmails,
    validateRoomMessageData,
    expandRoomsUsers,
};
