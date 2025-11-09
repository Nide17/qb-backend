const Quiz = require('./models/Quiz');
const Question = require('./models/Question');

const updateQuizQuestions = async (quizId, questionId, action) => {

    try {
        const quiz = await Quiz.findById(quizId);

        if (!quiz) throw { 'message': 'Quiz not found while updating questions!', 'status': 404 };

        if (action === 'add') {
            quiz.questions.push(questionId);
        } else if (action === 'remove') {
            quiz.questions.pull(questionId);
        }
        await quiz.save();
        return true;
    } catch (err) {
        throw { 'message': 'Error updating quiz questions!', 'status': 500 };
    }
};

// Expand array of quizzesIds
const getBatchedQuizzesMap = async (quizzesIds) => {

    try {
        if (!quizzesIds || !Array.isArray(quizzesIds) || quizzesIds.length === 0) return new Map();

        const quizzes = await Quiz.find({ _id: { $in: quizzesIds } }).populate('category questions', 'title questionText').select('title slug');
        if (!quizzes.length) throw { 'message': 'No quizzes found!', 'status': 404 };

        const quizzesMap = new Map();
        quizzes.forEach(q => quizzesMap.set(q._id.toString(), q));
        return quizzesMap;
    } catch (err) {
        return new Map();
    }
};

const getBatchedQuestionsMap = async (questionsIds) => {
    try {
        if (!questionsIds || !Array.isArray(questionsIds) || questionsIds.length === 0) return new Map();

        const questions = await Question.find({ _id: { $in: questionsIds } }).populate('quiz', 'questionText title');
        if (!questions.length) throw { 'message': 'No questions found!', 'status': 404 };

        const questionsMap = new Map();
        questions.forEach(q => questionsMap.set(q._id.toString(), q));
        return questionsMap;
    } catch (err) {
        return new Map();
    }
};

// Expand array of quizzes
const expandQuizzes = async (quizzes) => {
    try {
        if (!quizzes || !Array.isArray(quizzes) || quizzes.length === 0) return [];

        const quizzesIds = quizzes.map(q => q._id);
        const quizzesMap = await getBatchedQuizzesMap(quizzesIds);

        return quizzes.map(q => {
            const quiz = quizzesMap.get(q._id.toString());
            return {
                ...q._doc,
                category: quiz.category,
            };
        });
    } catch (err) {
        return quizzes;
    }
};

module.exports = {
    updateQuizQuestions,
    getBatchedQuestionsMap,
    getBatchedQuizzesMap,
    expandQuizzes,
};
