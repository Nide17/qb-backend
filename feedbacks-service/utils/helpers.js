const axios = require('axios');

// Helper function to call other services
const callService = async (url, timeout = 20000) => {

    if (!url || typeof url !== 'string' || url.startsWith('undefined')) return null;

    try {
        const response = await axios.get(url, {
            timeout, // 20 seconds default timeout for normal requests, longer for long running tasks
            headers: { 'Content-Type': 'application/json' }
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

    // Populate feedback score, and quiz details
    const [quiz, score] = await Promise.all([
        callService(`${process.env.QUIZZING_SERVICE_URL}/api/quizzes/${feedback.quiz}`),
        callService(`${process.env.SCORES_SERVICE_URL}/api/scores/${feedback.score}`)
    ]);

    const user = score?.taken_by ? await callService(`${process.env.USERS_SERVICE_URL}/api/users/${score.taken_by}`) : null;

    // Attach populated data to feedback
    feedbackObj.quiz = quiz ? { _id: quiz._id, title: quiz.title } : feedbackObj.quiz;
    feedbackObj.score = score ? {
        _id: score._id,
        marks: score.marks,
        out_of: score.out_of,
        taken_by: user ? { _id: user._id, name: user.name } : score.taken_by
    } : feedbackObj.score;

    return feedbackObj;
};

module.exports = { callService, populateFeedbackDetails };