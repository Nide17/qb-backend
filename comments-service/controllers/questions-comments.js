const QuestionComment = require('../models/QuestionComment');
const { handleError } = require('../utils/error');
const { populateComment } = require('../utils/helpers');

exports.getQuestionsComments = async (req, res) => {
    try {
        let questionComments = await QuestionComment.find().sort({ createdAt: -1 });
        questionComments = await Promise.all(questionComments.map(questionComment => populateComment(questionComment)));

        res.status(200).json(questionComments);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getPaginatedComments = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        let paginatedQuestionsComments = await QuestionComment.find()
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .sort({ createdAt: -1 })
            .exec();

        const count = await QuestionComment.countDocuments();

        paginatedQuestionsComments = await Promise.all(paginatedQuestionsComments.map(questionComment => populateComment(questionComment)));

        res.status(200).json({
            paginatedQuestionsComments,
            totalPages: Math.ceil(count / limit),
            currentPage: page
        });
    } catch (err) {
        handleError(res, err);
    }
};

exports.getPendingComments = async (req, res) => {
    try {
        let questionComments = await QuestionComment.find({ status: 'Pending' }).sort({ createdAt: -1 });
        questionComments = await Promise.all(questionComments.map(questionComment => populateComment(questionComment)));
        res.status(200).json(questionComments);

    } catch (err) {
        handleError(res, err);
    }
};

exports.getCommentsByQuestion = async (req, res) => {
    try {
        const questionComments = await QuestionComment.find({ question: req.params.id }).sort({ createdAt: -1 });
        res.status(200).json(await Promise.all(questionComments.map(questionComment => populateComment(questionComment))));
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneQuestionComment = async (req, res) => {
    try {
        let questionComment = await QuestionComment.findById(req.params.id).select('comment sender question quiz status createdAt updatedAt');
        if (!questionComment) throw { 'message': 'QuestionComment not found!', 'status': 404 };
        questionComment = await populateComment(questionComment) || questionComment;
        res.status(200).json(questionComment);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getCommentsByQuiz = async (req, res) => {
    try {
        let questionComments = await QuestionComment.find({ quiz: req.params.id }).sort({ createdAt: -1 });
        questionComments = await Promise.all(questionComments.map(questionComment => populateComment(questionComment)));
        res.status(200).json(questionComments);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createQuestionComment = async (req, res) => {
    const { comment, sender, question, quiz } = req.body;

    // Simple validation
    if (!comment || !sender || !quiz || !question) {
        throw { 'message': 'There are empty fields', 'status': 400 };
    }

    try {
        const newQuestionComment = new QuestionComment({
            comment,
            sender,
            question,
            quiz
        });

        const savedQuestionComment = await newQuestionComment.save();
        if (!savedQuestionComment) throw { 'message': 'Something went wrong during creation!', 'status': 500 };

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
        if (!questionComment) handleError(res, { status: 404, message: 'QuestionComment not found!' });

        const updatedQuestionComment = await QuestionComment.findByIdAndUpdate(commentID, { status: req.body.status }, { new: true });
        res.status(200).json(updatedQuestionComment);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateQuestionComment = async (req, res) => {
    try {
        const questionComment = await QuestionComment.findById(req.params.id);
        if (!questionComment) handleError(res, { status: 404, message: 'QuestionComment not found!' });

        const updatedQuestionComment = await QuestionComment.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updatedQuestionComment);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteQuestionComment = async (req, res) => {
    try {
        const questionComment = await QuestionComment.findById(req.params.id);
        if (!questionComment) handleError(res, { status: 404, message: 'QuestionComment not found!' });

        const removedQuestionComment = await QuestionComment.deleteOne({ _id: req.params.id });
        if (removedQuestionComment.deletedCount === 0) handleError(res, { status: 500, message: 'Something went wrong while deleting!' });

        res.status(200).json(questionComment);
    } catch (err) {
        handleError(res, err);
    }
};
