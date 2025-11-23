const { getBatchedQuizzesMap } = require('../quizzing/helpers');
const { getBatchedUsersMap } = require('../users/helpers');
const { getModels } = require('../../utils/db-manager');
const ScoreModel = require('./models/Score');

const getBatchedScoresMap = async (scoresIDs) => {

    if (!scoresIDs) throw { status: 404, message: 'No scores provided!' };

    try {

        const { Score } = await getModels('scores');

        const scores = await Score.find({ _id: { $in: scoresIDs } });
        if (!scores.length) throw { 'message': 'No scores found!', 'status': 404 };

        // Extract unique IDs
        const quizzesIDs = [...new Set(scores.map(s => s.quiz?.toString()))];
        const usersIDs = [...new Set(scores.map(s => s.taken_by?.toString()))];

        // Populating
        const quizzesMap = await getBatchedQuizzesMap(quizzesIDs);
        const usersMap = await getBatchedUsersMap(usersIDs);
        const scoresMap = new Map();

        scores.forEach(score => {
            const expandedScore = { ...score };

            if (score.quiz) {
                let quiz = quizzesMap.get(score.quiz.toString());

                if (quiz) {
                    expandedScore.quiz = quiz;
                    expandedScore.category = quiz?.category
                }
            }

            if (score.taken_by) {
                expandedScore.taken_by = usersMap.get(score.taken_by.toString());
            }
            scoresMap.set(score._id.toString(), expandedScore);
        });
        return scoresMap;
    } catch (err) {
        console.error(err.message);
        return new Map();
    }
};

// Expand array of scores
const expandScores = async (scores) => {

    if (!scores) throw { status: 404, message: 'No scores provided!' };

    try {
        // Extract unique IDs
        const quizzesIDs = [...new Set(scores.map(d => d.quiz?.toString()))];
        const usersIDs = [...new Set(scores.map(d => d.taken_by?.toString()))];

        // Get mappings
        const quizzesMap = await getBatchedQuizzesMap(quizzesIDs);
        const usersMap = await getBatchedUsersMap(usersIDs);

        // Map scores to expanded objects
        const expandedScores = scores.map(score => {
            const expandedScore = { ...score };

            if (score.quiz) {
                let quiz = quizzesMap.get(score.quiz.toString());

                if (quiz) {
                    expandedScore.quiz = {
                        _id: quiz._id,
                        title: quiz.title,
                    };
                    expandedScore.category = {
                        _id: quiz.category._id,
                        title: quiz.category.title
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

module.exports = { getBatchedScoresMap, expandScores, };
