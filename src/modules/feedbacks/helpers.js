const { getBatchedUsersMap } = require('../users/helpers');
const { getBatchedScoresMap } = require('../scores/helpers');
const { getBatchedQuizzesMap } = require('../quizzing/helpers');

const expandFeedbacks = async (feedbacks) => {

    if (!feedbacks || feedbacks.length === 0) return null;

    try {
        // Extract unique IDs
        const scoresIDs = [...new Set(feedbacks.map(fb => fb.score?.toString()).filter(Boolean))];
        const usersIDs = [...new Set(feedbacks.map(fb => fb.user?.toString()).filter(Boolean))];
        const quizzesIDs = [...new Set(feedbacks.map(fb => fb.quiz?.toString()).filter(Boolean))];

        // Populating
        const scoresMap = await getBatchedScoresMap(scoresIDs);
        const usersMap = await getBatchedUsersMap(usersIDs);
        const quizzesMap = await getBatchedQuizzesMap(quizzesIDs);

        // Map feedbacks to expanded objects
        const expandedFeedbacks = feedbacks.map(feedback => {
            const expandedFeedback = { ...feedback };
            if (feedback.quiz) expandedFeedback.quiz = quizzesMap.get(feedback.quiz.toString());
            if (feedback.score) expandedFeedback.score = scoresMap.get(feedback.score.toString());
            if (feedback.user) expandedFeedback.user = usersMap.get(feedback.user.toString());
            return expandedFeedback;
        });

        return expandedFeedbacks || feedbacks;
    } catch (err) {
        console.error(err.message);
        return feedbacks;
    }
}

module.exports = { expandFeedbacks };
