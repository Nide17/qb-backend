const QuizComment = require('../models/QuizComment');
const { handleError } = require('../utils/error');
const { populateComment, validateRequiredFields } = require('../utils/helpers');

exports.getQuizzesComments = async (req, res) => {
    try {
        let quizComments = await QuizComment.find();
        quizComments = await Promise.all(quizComments.map(quizComment => populateComment(quizComment)));
        res.status(200).json(quizComments);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneQuizComment = async (req, res) => {

    try {
        let quizComment = await QuizComment.findById(req.params.id);
        if (!quizComment) throw { 'message': 'QuizComment not found!', 'statusCode': 404 };
        quizComment = await populateComment(quizComment);
        res.status(200).json(quizComment);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getCommentsByQuiz = async (req, res) => {
    try {
        let quizComments = await QuizComment.find({ quiz: req.params.id });
        quizComments = await Promise.all(quizComments.map(quizComment => populateComment(quizComment)));
        res.status(200).json(quizComments);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createQuizComment = async (req, res) => {

    const { comment, quiz, sender } = req.body;

    try {
        // Validation 
        validateRequiredFields([{ name: 'comment', value: comment }, { name: 'quiz', value: quiz }, { name: 'sender', value: sender }]);

        // Create new QuizComment
        const newQuizComment = new QuizComment({ comment, quiz, sender });
        const savedQuizComment = await newQuizComment.save();
        if (!savedQuizComment) throw { message: 'Something went wrong while creating!!', statusCode: 500 };
        res.status(200).json(savedQuizComment);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateQuizComment = async (req, res) => {
    try {
        const quizComment = await QuizComment.findById(req.params.id);
        if (!quizComment) throw { message: 'QuizComment not found!', statusCode: 404 };

        const updatedQuizComment = await QuizComment.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updatedQuizComment);
    } catch (err) {
        handleError(res, err);
    }
};

exports.approveRejectComment = async (req, res) => {

    let commentID = req.params.id;

    try {
        const quizComment = await QuizComment.findById(commentID);
        if (!quizComment) throw { message: 'QuizComment not found!', statusCode: 404 };

        const updatedQuizComment = await QuizComment.findByIdAndUpdate(commentID, { status: req.body.status }, { new: true });
        res.status(200).json(updatedQuizComment);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteQuizComment = async (req, res) => {
    try {
        const quizComment = await QuizComment.findById(req.params.id);
        if (!quizComment) throw { message: 'QuizComment not found!', statusCode: 404 };

        const removedQuizComment = await QuizComment.deleteOne({ _id: req.params.id });
        if (removedQuizComment.deletedCount === 0) throw { message: 'Something went wrong while deleting!', statusCode: 500 };

        res.status(200).json(quizComment);
    } catch (err) {
        handleError(res, err);
    }
};
