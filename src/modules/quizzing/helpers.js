const QuizModel = require('./models/Quiz');
const QuestionModel = require('./models/Question');
const CourseCategoryModel = require('../courses/models/CourseCategory');
const UserModel = require('../users/models/User');
const { getBatchedCourseCategoriesMap } = require('../courses/helpers');

const updateQuizQuestions = async (quizId, questionId, action) => {

    try {
        const Quiz = await QuizModel();
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
        console.log(err.name);
        throw { 'message': 'Error updating quiz questions!', 'status': 500 };
    }
};

// Expand array of quizzesIds
const getBatchedQuizzesMap = async (quizzesIds) => {

    try {
        if (!quizzesIds || !Array.isArray(quizzesIds) || quizzesIds.length === 0) return new Map();

        const Quiz = await QuizModel();

        const quizzes = await Quiz.find({ _id: { $in: quizzesIds } }).populate('category questions', 'title questionText').select('title slug');
        if (!quizzes.length) throw { 'message': 'No quizzes found!', 'status': 404 };

        const quizzesMap = new Map();
        quizzes.forEach(q => quizzesMap.set(q._id.toString(), q));
        return quizzesMap;
    } catch (err) {
        console.log(err.name);
        return new Map();
    }
};

const getBatchedQuestionsMap = async (questionsIds) => {
    try {
        if (!questionsIds || !Array.isArray(questionsIds) || questionsIds.length === 0) return new Map();

        const Question = await QuestionModel();

        const questions = await Question.find({ _id: { $in: questionsIds } }).populate('quiz', 'questionText title');
        if (!questions.length) throw { 'message': 'No questions found!', 'status': 404 };

        const questionsMap = new Map();
        questions.forEach(q => questionsMap.set(q._id.toString(), q));
        return questionsMap;
    } catch (err) {
        console.log(err.name);
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
                ...q,
                category: quiz.category,
            };
        });
    } catch (err) {
        console.log(err.name);
        return quizzes;
    }
};

const expandCategories = async (categories) => {
    try {
        if (!categories || !Array.isArray(categories) || categories.length === 0) return [];

        const courseCategoriesIDs = categories.map(c => c.courseCategory);
        const coursesCategoriesMap = await getBatchedCourseCategoriesMap(courseCategoriesIDs);

        return categories.map(c => {
            const courseCategory = coursesCategoriesMap.get(c.courseCategory.toString());
            return {
                ...c,
                courseCategory: courseCategory,
            };
        });
    } catch (err) {
        console.log(err.name);
        return categories;
    }
};

const expandCategory = async (category) => {
    try {
        const CourseCategory = await CourseCategoryModel();
        const User = await UserModel();

        const courseCategory = await CourseCategory.findById(category.courseCategory).select('title');
        const created_by = await User.findById(category.created_by).select('name email');
        return {
            ...category,
            courseCategory: courseCategory,
            created_by: created_by,
        };
    } catch (err) {
        console.log(err.name);
        return category;
    }
};

module.exports = {
    updateQuizQuestions,
    getBatchedQuestionsMap,
    getBatchedQuizzesMap,
    expandQuizzes,
    expandCategories,
    expandCategory,
};
