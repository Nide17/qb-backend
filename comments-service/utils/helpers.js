const axios = require('axios');

// Helper function to call other services
const getFromService = async (url, timeout = 60000) => {

    if (!url || typeof url !== 'string' || url.startsWith('undefined')) return null;

    try {
        const response = await axios.get(url, {
            timeout, // 60 seconds default timeout for normal requests, longer for long running tasks
            headers: {
                'Content-Type': 'application/json',
            }
        });
        return response.data;
    } catch (err) {
        console.warn(`\n\nService call failed for URL: ${url}\nError:`, err.name, err.message);
        return null;
    }
};

// Helper function to validate required fields
const validateRequiredFields = (fields) => {
    for (const field of fields) {
        if (!field.value) {
            throw { message: `Missing required field: ${field.name}`, statusCode: 400 };
        }
    }
};

const populateUser = async (userId) => {
    if (!userId) return null;
    const data = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users/${userId}`);

    return data ? {
        _id: data._id,
        name: data.name
    } : { _id: userId, name: 'Unknown User' };
};

const populateComment = async (comment) => {

    if (!comment) return null;
    let commentObj = comment.toObject ? comment.toObject() : comment;

    try {
        // Fetch question - Questions Comments
        if (comment.question && comment.quiz) {
            const questionData = await getFromService(`${process.env.QUIZZING_SERVICE_URL}/api/questions/${comment.question}`);
            if (questionData) {
                commentObj.question = {
                    _id: questionData._id,
                    questionText: questionData.questionText
                };
                commentObj.quiz = {
                    _id: questionData.quiz._id,
                    title: questionData.quiz.title
                };
            }
            // Quizzes Comments
        } else if (!comment.question && comment.quiz) {
            const quizData = await getFromService(`${process.env.QUIZZING_SERVICE_URL}/api/quizzes/${comment.quiz}`);
            if (quizData) {
                commentObj.quiz = {
                    _id: quizData._id,
                    title: quizData.title
                };
            }
        }

        if (comment.sender) {
            const userData = await populateUser(comment.sender);
            if (userData) {
                commentObj.sender = userData;
            }
        }

        return commentObj;
    } catch (error) {
        console.log('Error populating comment :', error.message);
        return commentObj;
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
    validateRequiredFields,
    populateComment,
    corsOptions,
};
