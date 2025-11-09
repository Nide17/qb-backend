const Quiz = require('./models/Quiz');
const Question = require('./models/Question');
const User = require('../users/models/User');
const CourseCategory = require('../courses/models/CourseCategory');
const { getBatchedCourseCategories } = require('../courses/helpers');

// Simple population function for category
const populateOneCategory = async (category) => {

    if (!category) return null;

    let categoryObj = category.toObject ? category.toObject() : category;

    try {
        // Fetch courseCategory details
        if (category.courseCategory) {
            const cCategoryData = await CourseCategory.findById(category.courseCategory);
            if (cCategoryData) {
                categoryObj.courseCategory = cCategoryData;
            }
        }

        if (category.created_by) {
            const userData = await User.findById(category.created_by);
            if (userData) {
                categoryObj.created_by = userData;
            }
        }

        return categoryObj;
    } catch (error) {
        return categoryObj;
    }
};

const populateCategories = async (categories) => {

    if (!categories || categories.length === 0) return categories;

    try {
        // Convert to plain objects to avoid mongoose issues
        const plainCategories = categories.map(category => category.toObject ? category.toObject() : category);

        // Extract unique courseCategory IDs for better efficiency
        const courseCategoriesIDs = [...new Set(plainCategories.map(c => c.courseCategory?.toString()))];

        // Populate all courseCategory details in batch (assumed returns a map-like object or record)
        const courseCategoriesMap = await getBatchedCourseCategories(courseCategoriesIDs);

        // Map plainCategories to expanded objects
        const expandedPlainCategories = plainCategories.map(category => {
            const expandedCategory = { ...category };
            if (category.courseCategory && courseCategoriesMap.has(category.courseCategory.toString())) {
                expandedCategory.courseCategory = courseCategoriesMap.get(category.courseCategory.toString());
            }
            return expandedCategory;
        });

        return expandedPlainCategories || plainCategories;
    } catch (err) {
        return categories;
    }
};

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

// Populate array of quizzesIds
const getBatchedQuizzes = async (quizzesIds) => {

    try {
        if (!quizzesIds || !Array.isArray(quizzesIds) || quizzesIds.length === 0) return new Map();

        const quizzes = await Quiz.find({ _id: { $in: quizzesIds } }).populate('category', 'title').select('title');
        if (!quizzes.length) throw { 'message': 'No quizzes found!', 'status': 404 };

        const quizzesMap = new Map();
        quizzes.forEach(q => quizzesMap.set(q._id.toString(), q));
        return quizzesMap;
    } catch (err) {
        return new Map();
    }
};

const getBatchedQuestions = async (questionsIds) => {
    try {
        if (!questionsIds || !Array.isArray(questionsIds) || questionsIds.length === 0) return new Map();

        const questions = await Question.find({ _id: { $in: questionsIds } }).populate('quiz', 'questionText title');
        if (!questions.length) throw { 'message': 'No questions found!', 'status': 204 };

        const questionsMap = new Map();
        questions.forEach(q => questionsMap.set(q._id.toString(), q));
        return questionsMap;
    } catch (err) {
        return new Map();
    }
};

module.exports = {
    populateOneCategory,
    updateQuizQuestions,
    populateCategories,
    getBatchedQuestions,
    getBatchedQuizzes,
};
