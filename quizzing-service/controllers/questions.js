const Question = require("../models/Question");
const { handleError } = require('../utils/error');
const { validateRequiredFields, updateQuizQuestions, deleteImageFromS3 } = require('../utils/helpers');


exports.getQuestions = async (req, res) => {

    try {
        const questions = await Question.find().sort({ creation_date: -1 }).populate('category quiz');
        if (!questions) return res.status(404).json({ message: 'No questions found!' });
        res.status(200).json(questions);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneQuestion = async (req, res) => {
    try {
        const question = await Question.findOne({ _id: req.params.id }).populate('category quiz');
        if (!question) return res.status(404).json({ message: 'Question not found!' });
        res.status(200).json(question);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createQuestion = async (req, res) => {
    const { questionText, quiz, category, created_by, answerOptions, duration } = req.body;
    const qnImage = req.file;

    // Parse answer options from frontend
    const answers = answerOptions.map(a => JSON.parse(a));
    try {

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
            return res.status(400).json({ message: 'A question with same name already exists!' });
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

        // Update the Quiz on Question creation
        await updateQuizQuestions(quiz, savedQuestion._id, 'add');

        if (!savedQuestion) return handleError(res, 'Something went wrong during creation!');

        res.status(200).json(savedQuestion);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateQuestion = async (req, res) => {
    const { questionText, answerOptions, newQuiz, oldQuizID, last_updated_by, duration } = req.body;
    const qnImage = req.file;

    // Find the Question by id
    const qtn = await Question.findOne({ _id: req.params.id });
    if (!qtn) return res.status(404).json({ message: 'Question not found' });

    try {
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
                await deleteImageFromS3(qtn.question_image);
            }

            // Find the question by id and update
            const updatedQuestion = await Question.findByIdAndUpdate({ _id: qtn._id }, {
                questionText,
                question_image: qnImage && qnImage.location,
                answerOptions: answers,
                last_updated_by,
                duration,
            }, { new: true });

            res.status(200).json(updatedQuestion);
        }
    } catch (error) {
        handleError(res, error);
    }
};

exports.deleteQuestion = async (req, res) => {
    try {
        // Find the Question to delete by id first
        const question = await Question.findById(req.params.id);
        if (!question) return res.status(404).json({ message: 'Question not found' });

        // Delete existing image
        await deleteImageFromS3(question.question_image);

        // Remove question from questions of the quiz
        await updateQuizQuestions(question.quiz, question._id, 'remove');

        // Delete the question
        const removedQuestion = await question.deleteOne();

        if (removedQuestion.deletedCount === 0) return handleError(res, 'Something went wrong while deleting!');

        res.status(200).json(question);
    } catch (err) {
        handleError(res, err);
    }
};
