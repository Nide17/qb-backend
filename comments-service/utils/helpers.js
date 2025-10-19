const axios = require('axios');

// Helper function to validate required fields
const validateRequiredFields = (fields) => {
    for (const field of fields) {
        if (!field.value) {
            throw new Error(`Missing required field: ${field.name}`);
        }
    }
};

// Generalized function to populate sender and quiz fields
const populateSenderAndQuiz = async (entity, entityType) => {
    try {
        const fetchPromises = [];

        if (entityType === 'questionComment') {
            fetchPromises.push(
                entity.sender ? axios.get(`${process.env.USERS_SERVICE_URL}/api/users/${entity.sender}`) : Promise.resolve(null),
                entity.question ? axios.get(`${process.env.QUIZZING_SERVICE_URL}/api/questions/${entity.question}`) : Promise.resolve(null),
                entity.quiz ? axios.get(`${process.env.QUIZZING_SERVICE_URL}/api/quizzes/${entity.quiz}`) : Promise.resolve(null)
            );
        } else if (entityType === 'quizComment') {
            fetchPromises.push(
                entity.sender ? axios.get(`${process.env.USERS_SERVICE_URL}/api/users/${entity.sender}`) : Promise.resolve(null),
                entity.quiz ? axios.get(`${process.env.QUIZZING_SERVICE_URL}/api/quizzes/${entity.quiz}`) : Promise.resolve(null)
            );
        }

        const results = await Promise.allSettled(fetchPromises);

        entity = entity.toObject ? entity.toObject() : entity;
        if (entityType === 'questionComment') {
            entity.sender = results[0].status === 'fulfilled' && results[0].value ? {
                _id: results[0].value.data._id,
                name: results[0].value.data.name
            } : null;
            entity.question = results[1].status === 'fulfilled' && results[1].value ? {
                _id: results[1].value.data._id,
                questionText: results[1].value.data.questionText
            } : null;
            entity.quiz = results[2].status === 'fulfilled' && results[2].value ? {
                _id: results[2].value.data._id,
                title: results[2].value.data.title
            } : null;
        } else if (entityType === 'quizComment') {
            entity.sender = results[0].status === 'fulfilled' && results[0].value ? {
                _id: results[0].value.data._id,
                name: results[0].value.data.name
            } : null;
            entity.quiz = results[1].status === 'fulfilled' && results[1].value ? {
                _id: results[1].value.data._id,
                title: results[1].value.data.title
            } : null;
        }

        return entity;
    } catch (error) {
        console.log('Error in populateEntityDetails:', error.message);
        return entity.toObject ? entity.toObject() : entity;
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
    validateRequiredFields,
    populateSenderAndQuiz,
    corsOptions,
};
