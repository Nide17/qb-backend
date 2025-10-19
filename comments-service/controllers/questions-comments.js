const QuestionComment = require("../models/QuestionComment");
const { handleError } = require('../utils/error');
const { populateSenderAndQuiz } = require('../utils/helpers');

exports.getQuestionsComments = async (req, res) => {
    try {
        let questionComments = await QuestionComment.find();

        for (let i = 0; i < questionComments.length; i++) {
            questionComments[i] = await populateSenderAndQuiz(questionComments[i], 'questionComment');
        }

        res.status(200).json(questionComments);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getPaginatedComments = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        let questionComments = await QuestionComment.find()
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();

        const count = await QuestionComment.countDocuments();

        for (let i = 0; i < questionComments.length; i++) {
            questionComments[i] = await populateSenderAndQuiz(questionComments[i]);
        }

        res.json({
            questionComments,
            totalPages: Math.ceil(count / limit),
            currentPage: page
        });
    } catch (err) {
        handleError(res, err);
    }
};

exports.getPendingComments = async (req, res) => {
    try {
        let questionComments = await QuestionComment.find({ status: 'Pending' });

        for (let i = 0; i < questionComments.length; i++) {
            questionComments[i] = await populateSenderAndQuiz(questionComments[i]);
        }

        res.status(200).json(questionComments);

    } catch (err) {
        handleError(res, err);
    }
};

exports.getCommentsByQuestion = async (req, res) => {
    try {
        const questionComments = await QuestionComment.find({ question: req.params.questionId });
        res.status(200).json(questionComments);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneQuestionComment = async (req, res) => {
    try {
        let questionComment = await QuestionComment.findById(req.params.id).select('comment sender question quiz status createdAt updatedAt');
        if (!questionComment) return res.status(404).json({ message: 'No questionComment found!' });
        questionComment = await populateSenderAndQuiz(questionComment) || questionComment;
        res.status(200).json(questionComment);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getCommentsByQuiz = async (req, res) => {
    try {
        let questionComments = await QuestionComment.find({ quiz: req.params.quizId });

        for (let i = 0; i < questionComments.length; i++) {
            questionComments[i] = await populateSenderAndQuiz(questionComments[i]);
        }

        res.status(200).json(questionComments);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createQuestionComment = async (req, res) => {
    const { comment, sender, question, quiz } = req.body;

    // Simple validation
    if (!comment || !sender || !quiz || !question) {
        return res.status(400).json({ message: 'There are empty fields' });
    }

    try {
        const newQuestionComment = new QuestionComment({
            comment,
            sender,
            question,
            quiz
        });

        const savedQuestionComment = await newQuestionComment.save();
        if (!savedQuestionComment) return res.status(500).json({ message: 'Something went wrong during creation!' });

        res.status(200).json({
            _id: savedQuestionComment._id,
            comment: savedQuestionComment.comment,
            sender: savedQuestionComment.sender,
            question: savedQuestionComment.question,
            quiz: savedQuestionComment.quiz
        });
    } catch (err) {
        handleError(res, err);
    }
};

exports.approveRejectComment = async (req, res) => {

    let commentID = req.params.id;

    try {
        const questionComment = await QuestionComment.findById(commentID);
        if (!questionComment) return res.status(404).json({ message: 'QuestionComment not found!' });

        const updatedQuestionComment = await QuestionComment.findByIdAndUpdate(commentID, { status: req.body.status }, { new: true });
        res.status(200).json(updatedQuestionComment);
    } catch (err) {
        handleError(res, err);
    }
}

exports.updateQuestionComment = async (req, res) => {
    try {
        const questionComment = await QuestionComment.findById(req.params.id);
        if (!questionComment) return res.status(404).json({ message: 'QuestionComment not found!' });

        const updatedQuestionComment = await QuestionComment.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updatedQuestionComment);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteQuestionComment = async (req, res) => {
    try {
        const questionComment = await QuestionComment.findById(req.params.id);
        if (!questionComment) return res.status(404).json({ message: 'QuestionComment not found!' });

        const removedQuestionComment = await QuestionComment.deleteOne({ _id: req.params.id });
        if (removedQuestionComment.deletedCount === 0) return res.status(500).json({ message: 'Something went wrong while deleting!' });

        res.status(200).json(questionComment);
    } catch (err) {
        handleError(res, err);
    }
};
