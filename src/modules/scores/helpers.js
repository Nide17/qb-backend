const Score = require("./models/Score");

// Simple expansion function for users
const populateOneUser = async (userId) => {

    if (!userId) return null;

    try {
        const usr = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users/${userId}`);

        return usr ? {
            _id: usr._id,
            name: usr.name
        } : { _id: userId, name: 'Unknown User' };
    } catch (err) {
        return { _id: userId, name: 'Unknown User' };
    }
};
// Expand score 
const populateOneScore = async (score) => {

    if (!score) return null;
    let scoreObj = score.toObject ? score.toObject() : score;

    try {
        if (score.quiz) {
            const quizData = await getFromService(`${process.env.QUIZZING_SERVICE_URL}/api/quizzes/${score.quiz}`);
            if (quizData) {
                scoreObj.quiz = quizData;
                scoreObj.category = quizData.category;
            }
        }

        if (score.taken_by) {
            const userData = await populateOneUser(score.taken_by);
            if (userData) {
                scoreObj.taken_by = userData;
            }
        }

        return scoreObj;
    } catch (error) {
        return scoreObj;
    }
};

const getBatchedScores = async (scoresIDs) => {

    if (!scoresIDs || scoresIDs.length === 0) return new Map();

    try {
        const scores = await Score.find({ _id: { $in: scoresIDs } });
        const scoresMap = new Map();
        for (const score of scores || []) {
            scoresMap.set(score._id.toString(), {
                _id: score?._id,
                id: score?.id,
                marks: score?.marks,
                out_of: score?.out_of
            });
        }
        return scoresMap;
    } catch (err) {
        return new Map();
    }
};

module.exports = {
    populateOneScore,
    getBatchedScores,
};
