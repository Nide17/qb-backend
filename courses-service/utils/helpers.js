const axios = require('axios');

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
        console.warn(`\n\nService call failed for URL: ${url}\nError:`, err.name, err.message);
        return null;
    }
};

// Simple population function for users
const populateUser = async (userId) => {
    if (!userId) return null;
    const data = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users/${userId}`);

    return data ? {
        _id: data._id,
        name: data.name
    } : { _id: userId, name: 'Unknown User' };
};

// Generalized helper function to validate required fields
const validateRequiredFields = (fields) => {
    for (const field of fields) {
        if (!field.value) {
            throw { message: `Missing required field: ${field.name}`, statusCode: 400 };
        }
    }
};

const allowList = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:5000',
    'https://www.quizblog.rw',
    'https://www.quizblog.online',
];

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowList.includes(origin)) {
            callback(null, true);
        } else {
            console.log(origin + ' is not allowed by CORS');
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    preflightContinue: false,
    optionsSuccessStatus: 200,
    maxAge: 3600
};

module.exports = {
    getFromService,
    populateUser,
    validateRequiredFields,
    corsOptions,
};
