const { getModels } = require('../../../utils/db-manager');
const slugify = require('slugify');
const { handleError } = require('../../../utils/error');
const { updateQuizQuestions } = require('../helpers');
const { deleteS3File, validateRequiredFields, cacheManager, cacheWrapper } = require('../../../utils/global-helpers');

const CACHE_TTL = 3600; // 1 hour
const CACHE_KEYS = {
    ALL: "qn:all",
    ONE: (id) => `qn:${id}`,
};

exports.getQuestions = async (req, res) => {

    try {
        const cacheKey = CACHE_KEYS.ALL;

        // Initialize all models before any populate operations
        const { Question } = await getModels('quizzing');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const questions = await Question.find().sort({ creation_date: -1 }).lean();
            if (!questions || questions.length === 0) throw { 'message': 'No questions found!', 'status': 404 };

            return questions;
        });

        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneQuestion = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ONE(req.params.id);
        const { Question } = await getModels('quizzing');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const question = await Question.findOne({ _id: req.params.id }).populate('category quiz');
            if (!question) throw { 'message': 'Question not found!', 'status': 404 };

            return question;
        });

        res.status(200).json(data);
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

        const { Question } = await getModels('quizzing');

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
        await cacheManager.invalidatePattern("qz:*");
        await cacheManager.invalidatePattern("qn:*");
        res.status(201).json(savedQuestion);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateQuestion = async (req, res) => {

    try {
        const body = req.body || {};
        const {
            questionText,
            answerOptions = [],
            newQuiz,
            oldQuizID,
            last_updated_by,
            duration,
        } = body;

        const qnImage = req.file;

        const { Question } = await getModels('quizzing');

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
            if (qnImage && qtn.question_image) {
                await deleteS3File(qtn.question_image);
            }

            // Find the question by id and update
            const updatedQuestion = await Question.findByIdAndUpdate({ _id: qtn._id }, {
                questionText,
                slug: slugify(`${questionText}`, { replacement: '-', lower: true, strict: true }),
                question_image: qnImage && qnImage.location,
                answerOptions: answers,
                last_updated_by,
                duration,
            }, { new: true });

            if (!updatedQuestion) throw { 'message': 'Something went wrong while updating!', 'status': 500 };

            await cacheManager.invalidatePattern("qz:*");
            await cacheManager.invalidatePattern("qn:*");

            res.status(200).json(updatedQuestion);
        }
    } catch (err) {
        console.log(err);
        handleError(res, err);
    }
};

exports.deleteQuestion = async (req, res) => {
    try {
        const { Question } = await getModels('quizzing');

        // Find the Question to delete by id first
        const question = await Question.findById(req.params.id);
        if (!question) throw { 'message': 'Question not found', 'status': 404 };

        // Delete existing image
        question.question_image && await deleteS3File(question.question_image);

        // Remove question from questions of the quiz
        await updateQuizQuestions(question.quiz, question._id, 'remove');

        // Delete the question
        const removedQuestion = await question.deleteOne();

        if (removedQuestion.deletedCount === 0) throw { 'message': 'Something went wrong while deleting!', 'status': 500 };

        // Clear cache for keys
        await cacheManager.invalidatePattern("qz:*");
        await cacheManager.invalidatePattern("qn:*");
        res.status(200).json(question);
    } catch (err) {
        handleError(res, err);
    }
};
