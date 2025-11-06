const axios = require('axios');
const { S3 } = require('@aws-sdk/client-s3');

// Helper function to call other services
const getFromService = async (url, timeout = 20000, token) => {

    if (!url || typeof url !== 'string' || url.startsWith('undefined')) return null;

    try {
        const response = await axios.get(url, {
            timeout, // 20 seconds default timeout for normal requests, longer for long running tasks
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

// Simple expansion function for users
const populateOneUser = async (userId) => {

    if (!userId) return null;

    try {
        const data = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users/${userId}`);

        return data ? {
            _id: data._id,
            name: data.name
        } : { _id: userId, name: 'Unknown User' };
    } catch (err) {
        return { _id: userId, name: 'Unknown User' };
    }
};


const populateBatchedUsers = async (userIDs) => {

    if (!userIDs || userIDs.length === 0) return userIDs;

    try {
        const response = await axios.post(`${process.env.USERS_SERVICE_URL}/api/users/batch`, { userIDs }, { timeout: 20000 });
        const usersMap = new Map();
        for (const user of response.data || []) {
            usersMap.set(user._id.toString(), user);
        }
        return usersMap;
    } catch (err) {
        return new Map();
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

// AWS S3 Configuration
const s3Config = new S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    Bucket: process.env.S3_BUCKET,
    region: process.env.AWS_REGION
});


module.exports = {
    getFromService,
    populateOneUser,
    populateBatchedUsers,
    validateRequiredFields,
    s3Config,
};
