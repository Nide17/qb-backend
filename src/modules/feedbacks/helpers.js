const { getBatchedUsers } = require('../users/helpers');
const { getBatchedScores } = require('../scores/helpers');
const { getBatchedQuizzes } = require('../quizzing/helpers');

const expandFeedbacks = async (feedbacks) => {

    if (!feedbacks || feedbacks.length === 0) return null;

    try {
        // Convert to plain objects to avoid mongoose issues
        const plainFeedbacks = feedbacks.map(feedback => feedback.toObject ? feedback.toObject() : feedback);

        // Extract unique scores IDs for better efficiency
        const scoresIDs = [...new Set(plainFeedbacks.map(fb => fb.score?.toString()).filter(Boolean))];

        // Extract unique user IDs for better efficiency
        const usersIDs = [...new Set(plainFeedbacks.map(fb => fb.user?.toString()).filter(Boolean))];

        // Extract unique quiz IDs for better efficiency
        const quizzesIDs = [...new Set(plainFeedbacks.map(fb => fb.quiz?.toString()).filter(Boolean))];

        // Populating
        const batchedScores = await getBatchedScores(scoresIDs);
        const batchedUsers = await getBatchedUsers(usersIDs);
        const batchedQuizzes = await getBatchedQuizzes(quizzesIDs);

        // Map plainFeedbacks to expanded objects
        const expandedPlainFeedbacks = plainFeedbacks.map(feedback => {
            const expandedFeedback = { ...feedback };
            if (feedback.quiz) expandedFeedback.quiz = batchedQuizzes.get(feedback.quiz.toString());
            if (feedback.score) expandedFeedback.score = batchedScores.get(feedback.score.toString());
            if (feedback.user) expandedFeedback.user = batchedUsers.get(feedback.user.toString());
            return expandedFeedback;
        });

        return expandedPlainFeedbacks || plainFeedbacks;
    } catch (err) {
        console.error(err.message);
        return feedbacks;
    }
}

module.exports = { expandFeedbacks };
