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

// Helper function to expand users in chat rooms
const populateUsersInChatRooms = async (chatRooms) => {

    const ids = chatRooms.map(room => room.users).flat();
    const userIDs = [...new Set(ids)].filter(id => id);

    try {
        if (userIDs.length > 0) {
            const users = await axios.post(`${process.env.USERS_SERVICE_URL}/api/users/batch`, { userIDs }, 200000);
            const usersMap = users?.data?.reduce((acc, user) => {
                acc[user._id] = user;
                return acc;
            }, {});
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
    getFromService,
    notifyAdmins,
    sendEmails,
    validateRequiredFields,
    validateRoomMessageData,
    populateUsersInChatRooms,
};
