const { getModels } = require('../../utils/db-manager');
// models will be loaded via getModels(dbName) when needed
const { getBatchedCourseCategoriesMap } = require('../courses/helpers');

const updateQuizQuestions = async (quizId, questionId, action) => {

    try {
        const { Quiz } = await getModels('quizzing');
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
        console.log(err);
        throw { 'message': 'Error updating quiz questions!', 'status': 500 };
    }
};

// Expand array of quizzesIds
const getBatchedQuizzesMap = async (quizzesIds) => {

    try {
        if (!quizzesIds || !Array.isArray(quizzesIds) || quizzesIds.length === 0) return new Map();

        const { Quiz } = await getModels('quizzing');

        const quizzes = await Quiz.find({ _id: { $in: quizzesIds } }).populate('category questions', 'title questionText').select('title slug created_by creation_date');
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

        const { Question } = await getModels('quizzing');

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
        const { CourseCategory } = await getModels('courses');
        const { User } = await getModels('users');

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

const safeQuizForResponseNoID = (quizObj) => {
    if (!quizObj) return null;

    // Select only safe/public fields to return (and to cache)
    const { title, category, questions, creation_date } = quizObj;
    return {
        title,
        category: category?.title || '',
        questions: questions?.length || 0,
        creation_date: creation_date ? new Date(creation_date).toLocaleString() : null,
    };
};


module.exports = {
    updateQuizQuestions,
    getBatchedQuestionsMap,
    getBatchedQuizzesMap,
    expandQuizzes,
    expandCategories,
    expandCategory,
    safeQuizForResponseNoID,
};
