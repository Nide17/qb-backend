const QuizComment = require("../models/QuizComment");
const { handleError } = require('../utils/error');
const { populateSenderAndQuiz } = require('../utils/helpers');

exports.getQuizzesComments = async (req, res) => {
    try {
        let quizComments = await QuizComment.find();

        for (let i = 0; i < quizComments.length; i++) {
            quizComments[i] = await populateSenderAndQuiz(quizComments[i], 'quizComment');
        }

        res.status(200).json(quizComments);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneQuizComment = async (req, res) => {

    try {
        let quizComment = await QuizComment.findById(req.params.id).select(selectFields);
        if (!quizComment) throw new Error('QuizComment not found!');
        quizComment = await populateSenderAndQuiz(quizComment);
        res.status(200).json(quizComment);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getCommentsByQuiz = async (req, res) => {
    try {
        let quizComments = await QuizComment.find({ quiz: req.params.quizId });

        for (let i = 0; i < quizComments.length; i++) {
            quizComments[i] = await populateSenderAndQuiz(quizComments[i]);
        }

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
        if (!savedQuizComment) throw new Error('Something went wrong while creating!!');

        res.status(200).json({
            _id: savedQuizComment._id,
            comment: savedQuizComment.comment,
            sender: savedQuizComment.sender,
            quiz: savedQuizComment.quiz
        });
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateQuizComment = async (req, res) => {
    try {
        const quizComment = await QuizComment.findById(req.params.id);
        if (!quizComment) throw new Error('QuizComment not found!');

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
        if (!quizComment) throw new Error('QuizComment not found!');

        const updatedQuizComment = await QuizComment.findByIdAndUpdate(commentID, { status: req.body.status }, { new: true });
        res.status(200).json(updatedQuizComment);
    } catch (err) {
        handleError(res, err);
    }
}

exports.deleteQuizComment = async (req, res) => {
    try {
        const quizComment = await QuizComment.findById(req.params.id);
        if (!quizComment) throw new Error('QuizComment not found!');

        const removedQuizComment = await QuizComment.deleteOne({ _id: req.params.id });
        if (removedQuizComment.deletedCount === 0) throw new Error('Something went wrong while deleting!');

        res.status(200).json(quizComment);
    } catch (err) {
        handleError(res, err);
    }
};
