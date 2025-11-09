const { getBatchedQuizzes } = require('../quizzing/helpers');
const { getBatchedUsers } = require('../users/helpers');

// Populate array of scores
const expandScores = async (scores) => {

    if (!scores) throw { status: 404, message: 'No scores provided!' };

    try {
        // Extract unique note IDs for better efficiency
        const quizzesIDs = [...new Set(scores.map(d => d.quiz?.toString()))];

        // Extract unique user IDs for better efficiency
        const usersIDs = [...new Set(scores.map(d => d.taken_by?.toString()))];

        // Populating
        const quizzesMap = await getBatchedQuizzes(quizzesIDs);
        const usersMap = await getBatchedUsers(usersIDs);

        // Map scores to expanded objects
        const expandedScores = scores.map(score => {
            const expandedScore = { ...score };

            if (score.quiz) {
                let batchedQuiz = quizzesMap.get(score.quiz.toString());

                if (batchedQuiz) {
                    expandedScore.quiz = {
                        _id: batchedQuiz._id,
                        title: batchedQuiz.title,
                    };
                    expandedScore.category = {
                        _id: batchedQuiz.category._id,
                        title: batchedQuiz.category.title
                    }
                }
            }

            if (score.taken_by) {
                expandedScore.taken_by = usersMap.get(score.taken_by.toString());
            }
            return expandedScore;
        });
        return expandedScores || scores;
    } catch (err) {
        console.error(err.message);
        return {}
    }
};

module.exports = { expandScores };
