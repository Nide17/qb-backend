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

// Simple population function for feedback details
const populateFeedbackDetails = async (feedback) => {

    if (!feedback) return null;

    let feedbackObj = feedback.toObject ? feedback.toObject() : feedback;

    // Fetch related quiz and user data
    const quiz = feedback?.quiz ? await getFromService(`${process.env.QUIZZING_SERVICE_URL}/api/quizzes/${feedback.quiz}`) : null;
    const user = feedback?.user ? await getFromService(`${process.env.USERS_SERVICE_URL}/api/users/${feedback.user}`) : null;

    // Attach populated data to feedback object
    feedbackObj.quiz = quiz ? { _id: quiz._id, title: quiz.title } : feedbackObj.quiz;
    feedbackObj.user = user ? { _id: user._id, name: user.name, email: user.email } : {
        _id: feedbackObj.user,
        name: 'N/A',
    };

    return feedbackObj;
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
    populateFeedbackDetails,
    corsOptions,
};
