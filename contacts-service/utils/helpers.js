const axios = require('axios');
const { sendEmail } = require('../utils/emails/sendEmail');

// Helper function to call other services (shared pattern)
const getFromService = async (url, timeout = 20000, token) => {
    if (!url || typeof url !== 'string' || url.startsWith('undefined')) return null;

    try {
        const response = await axios.get(url, {
            timeout,
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token
            }
        });
        return response.data;
    } catch (err) {
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
                './template/broadcast.handlebars'
            );
        }, 2000 * index);
    });
};

const notifyAdmins = async (newContact) => {
    try {
        const fetchAdminEmails = async () => {
            try {
                const adminEmails = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users/admins-emails`);
                return adminEmails;
            } catch (error) {
                console.warn('Failed to fetch admin emails:', error.message);
                return new Promise((resolve) => {
                    setTimeout(async () => {
                        try {
                            const retryAdminEmails = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users/admins-emails`);
                            resolve(retryAdminEmails);
                        } catch (retryError) {
                            console.warn('Retry failed to fetch admin emails:', retryError.message);
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
            throw { message: `Missing required field: ${field.name}`, status: 400 };
        }
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

// Helper function to populate users in chat rooms
const populateUsersInChatRooms = async (chatRooms) => {
    const userIds = chatRooms.map(room => room.users).flat();
    const uniqueUserIds = [...new Set(userIds)].filter(id => id);

    try {
        const userResults = await Promise.allSettled(
            uniqueUserIds.map(async (userId) => {
                if (!userId) return null;
                const response = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users/${userId}`);
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
        return chatRooms;
    }
};

module.exports = {
    getFromService,
    notifyAdmins,
    sendEmails,
    validateRequiredFields,
    validateRoomMessageData,
    populateUsersInChatRooms,
};
