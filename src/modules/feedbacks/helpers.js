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
        throw err;
    }
};

// Simple population function for feedback details
const populateOneFeedback = async (feedback) => {

    if (!feedback) return null;
    let feedbackObj = feedback.toObject ? feedback.toObject() : feedback;

    try {

        // Fetch related quiz and user data
        const quiz = feedback?.quiz ? await getFromService(`${process.env.QUIZZING_SERVICE_URL}/api/quizzes/${feedback.quiz}`) : null;
        const user = feedback?.user ? await getFromService(`${process.env.USERS_SERVICE_URL}/api/users/${feedback.user}`) : null;

        // Attach expanded data to feedback object
        feedbackObj.quiz = quiz ? { _id: quiz._id, title: quiz.title } : feedbackObj.quiz;
        feedbackObj.user = user ? { _id: user._id, name: user.name, email: user.email } : {
            _id: feedbackObj.user,
            name: 'N/A',
        };

        return feedbackObj;
    } catch (err) {
        return feedbackObj;
    }
};

const populateBatchedUsers = async (usersIDs) => {

    if (!usersIDs || usersIDs.length === 0) return usersIDs;

    try {
        const response = await axios.post(`${process.env.USERS_SERVICE_URL}/api/users/batch`, { usersIDs }, { timeout: 20000 });
        const usersMap = new Map();
        for (const user of response.data || []) {
            usersMap.set(user._id.toString(), user);
        }
        return usersMap;
    } catch (err) {
        return new Map();
    }
};

const populateBatchedScores = async (scoresIDs) => {

    if (!scoresIDs || scoresIDs.length === 0) return scoresIDs;

    try {
        const response = await axios.post(`${process.env.SCORES_SERVICE_URL}/api/scores/batch`, { scoresIDs }, { timeout: 20000 });
        const scoresMap = new Map();
        for (const score of response.data || []) {
            scoresMap.set(score._id.toString(), score);
        }
        return scoresMap;
    } catch (err) {
        return new Map();
    }
};

const populateBatchedFeedbacks = async (feedbacks) => {

    if (!feedbacks || feedbacks.length === 0) return null;

    try {
        // Convert to plain objects to avoid mongoose issues
        const plainFeedbacks = feedbacks.map(feedback => feedback.toObject ? feedback.toObject() : feedback);

        // Extract unique scores IDs for better efficiency
        const scoresIDs = [...new Set(plainFeedbacks.map(fb => fb.score?.toString()).filter(Boolean))];

        // Extract unique user IDs for better efficiency
        const usersIDs = [...new Set(plainFeedbacks.map(fb => fb.user?.toString()).filter(Boolean))];

        // Populating
        const batchedScores = await populateBatchedScores(scoresIDs);
        const batchedUsers = await populateBatchedUsers(usersIDs);

        // Map plainFeedbacks to expanded objects
        const expandedPlainFeedbacks = plainFeedbacks.map(feedback => {

            const expandedFeedback = { ...feedback };

            if (feedback.score) {

                let score = batchedScores.get(feedback.score.toString());

                expandedFeedback.score = {
                    _id: score?._id,
                    id: score?.id,
                    marks: score?.marks,
                    out_of: score?.out_of
                }
            }

            if (feedback.user) {
                expandedFeedback.user = batchedUsers.get(feedback.user.toString());
            }
            return expandedFeedback;
        });

        return expandedPlainFeedbacks || plainFeedbacks;
    } catch (err) {
        console.error(err.message);
        return {}
    }
}

module.exports = {
    getFromService,
    populateOneFeedback,
    populateBatchedFeedbacks,
};
