const Question = require('../models/Question');
const slugify = require('slugify');
const { handleError } = require('../../../utils/error');
const { updateQuizQuestions } = require('../helpers');
const { deleteImageFromS3, validateRequiredFields, redisCache, getCachedData, setCachedData } = require('../../../utils/global-helpers');

const keysToClear = new Set();
exports.getQuestions = async (req, res) => {

    try {
        const cacheKey = 'all_questions'
        const cached = await getCachedData(cacheKey);
        // if (cached) return res.status(200).json(cached);

        const questions = await Question.find().sort({ creation_date: -1 }).lean();
        if (!questions || questions.length === 0) throw { 'message': 'No questions found!', 'status': 404 };

        await setCachedData(cacheKey, questions) && keysToClear.add(cacheKey);
        res.status(200).json(questions);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneQuestion = async (req, res) => {
    try {
        const question = await Question.findOne({ _id: req.params.id }).populate('category quiz');
        if (!question) throw { 'message': 'Question not found!', 'status': 404 };
        res.status(200).json(question);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createQuestion = async (req, res) => {

    try {
        const { questionText, quiz, category, created_by, answerOptions, duration } = req.body;
        const qnImage = req.file;

        // Parse answer options from frontend
        const answers = answerOptions.map(a => JSON.parse(a));

        // Validate required fields
        validateRequiredFields([
            { name: 'questionText', value: questionText },
            { name: 'quiz', value: quiz },
            { name: 'category', value: category },
            { name: 'answerOptions', value: answerOptions },
            { name: 'duration', value: duration }
        ]);

        // Check for duplicate questionText
        let existingQtn = await Question.findOne({ questionText });

        if (existingQtn) {
            throw { 'message': 'A question with same name already exists!', 'status': 400 };
        }

        const newQuestion = new Question({
            questionText,
            question_image: qnImage && qnImage.location,
            answerOptions: answers,
            category,
            quiz,
            created_by,
            duration,
        });

        const savedQuestion = await newQuestion.save();
        if (!savedQuestion) {
            throw { 'message': 'Something went wrong during creation!', 'status': 500 };
        }

        // Update the Quiz on Question creation
        const isQuizUpdated = await updateQuizQuestions(quiz, savedQuestion._id, 'add');

        if (isQuizUpdated.deletedCount === 0) {
            Question.deleteOne(savedQuestion._id);
            throw { 'message': 'Cannot update corresponding quiz!', 'status': 500 };
        }

        // Clear cache for keys
        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(savedQuestion);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateQuestion = async (req, res) => {

    try {
        const { questionText, answerOptions, newQuiz, oldQuizID, last_updated_by, duration } = req.body;
        const qnImage = req.file;

        // Find the Question by id
        const qtn = await Question.findOne({ _id: req.params.id });
        if (!qtn) throw { 'message': 'Question not found', 'status': 404 };

        // Changing question's quiz
        if (newQuiz && oldQuizID) {
            const updatedQuestion = await Question.findByIdAndUpdate({ _id: qtn._id }, {
                quiz: newQuiz,
                last_updated_by,
            }, { new: true });

            // Delete Question in old quiz
            await updateQuizQuestions(oldQuizID, qtn._id, 'remove');

            // Update the Quiz on Question updating
            await updateQuizQuestions(newQuiz, qtn._id, 'add');

            res.status(200).json(updatedQuestion);
        } else {
            // Changing answerOptions from string to json
            const answers = answerOptions.map(a => JSON.parse(a));

            // Delete existing image
            qtn.question_image && await deleteImageFromS3(qtn.question_image);

            // Find the question by id and update
            const updatedQuestion = await Question.findByIdAndUpdate({ _id: qtn._id }, {
                questionText,
                slug: slugify(`${questionText}`, { replacement: '-', lower: true, strict: true }),
                question_image: qnImage && qnImage.location,
                answerOptions: answers,
                last_updated_by,
                duration,
            }, { new: true });

            res.status(200).json(updatedQuestion);
        }
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteQuestion = async (req, res) => {
    try {
        // Find the Question to delete by id first
        const question = await Question.findById(req.params.id);
        if (!question) throw { 'message': 'Question not found', 'status': 404 };

        // Delete existing image
        question.question_image && await deleteImageFromS3(question.question_image);

        // Remove question from questions of the quiz
        await updateQuizQuestions(question.quiz, question._id, 'remove');

        // Delete the question
        const removedQuestion = await question.deleteOne();

        if (removedQuestion.deletedCount === 0) throw { 'message': 'Something went wrong while deleting!', 'status': 500 };

        // Clear cache for keys
        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(question);
    } catch (err) {
        handleError(res, err);
    }
};
