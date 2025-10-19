const axios = require('axios');
const Score = require("../models/Score");
const { handleError } = require('./error');

// Helper function to call other services
const callService = async (url, timeout = 20000, token) => {

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

// Cache for frequently accessed data
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper function to get cached data
const getCachedData = (key) => {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    cache.delete(key);
    return null;
};

// Helper function to set cached data
const setCachedData = (key, data) => {
    cache.set(key, { data, timestamp: Date.now() });
};

// Clear expired cache entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
        if (now - value.timestamp >= CACHE_TTL) {
            cache.delete(key);
        }
    }
}, CACHE_TTL);

// Simple population function for users
const populateUser = async (userId) => {
    if (!userId) return null;
    const data = await callService(`${process.env.USERS_SERVICE_URL}/api/users/${userId}`);

    return data ? {
        _id: data._id,
        name: data.name
    } : { _id: userId, name: 'Unknown User' };
};

// Populate score 
const populateScore = async (score) => {
    if (!score) return null;

    let scoreObj = score.toObject ? score.toObject() : score;

    try {
        // Fetch category 
        if (score.category) {
            const categoryData = await callService(`${process.env.QUIZZING_SERVICE_URL}/api/categories/${score.category}`);
            if (categoryData) {
                scoreObj.category = categoryData;

                if (score.quiz) {
                    const quizData = await callService(`${process.env.QUIZZING_SERVICE_URL}/api/quizzes/${score.quiz}`);
                    if (quizData) {
                        scoreObj.quiz = quizData;
                    }
                }
            }
        }

        if (score.taken_by) {
            const userData = await populateUser(score.taken_by);
            if (userData) {
                scoreObj.taken_by = userData;
            }
        }

        return scoreObj;
    } catch (error) {
        console.log('Error populating score :', error.message);
        return scoreObj;
    }
};

// Populate array of scores
const populateScores = async (scores) => {
    if (!scores || scores.length === 0) return scores;

    let populatedScores = [];
    for (const score of scores) {
        let populated = await populateScore(score);
        populatedScores.push(populated);
    }

    return populatedScores;
};

// Helper function to find score by ID
const findScoreById = async (id, res, selectFields = '') => {
    try {

        let score = await Score.findOne({ id: id }).select(selectFields);
        let scoreObj = null;

        if (score) {

            // Populate fields
            scoreObj = score.toObject ? score.toObject() : score;
            scoreObj = await populateScore(scoreObj);
        } else {

            // Populate fields
            score = await Score.findById(id).select(selectFields).exec();
            scoreObj = score.toObject ? score.toObject() : score;
            scoreObj = await populateScore(scoreObj);
        }

        if (!scoreObj) return res.status(404).json({ message: 'Score not found!' });

        return scoreObj;
    } catch (err) {
        handleError(res, err);
        return null;
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
    getCachedData,
    setCachedData,
    populateScore,
    populateScores,
    findScoreById,
    callService,
    corsOptions,
};
