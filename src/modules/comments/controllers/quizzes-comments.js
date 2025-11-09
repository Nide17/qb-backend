const QuizComment = require('../models/QuizComment');
const { handleError } = require('../../../utils/error');
const { expandComments } = require('../helpers');
const User = require('../../users/models/User');
const Quiz = require('../../quizzing/models/Quiz');
const { validateRequiredFields, redisCache, getCachedData, setCachedData } = require('../../../utils/global-helpers');

const keysToClear = new Set();
exports.getQuizzesComments = async (req, res) => {
    try {
        const cacheKey = 'quizComments';
        const cachedData = await getCachedData(cacheKey);
        if (cachedData) return res.status(200).json(cachedData);

        let quizComments = await QuizComment.find().sort({ createdAt: -1 }).lean();
        const expandedComments = await expandComments(quizComments);
        quizComments = expandedComments ? expandedComments : quizComments;

        await setCachedData(cacheKey, quizComments) && keysToClear.add(cacheKey);
        res.status(200).json(quizComments);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneQuizComment = async (req, res) => {

    try {

        let quizComment = await QuizComment.findById(req.params.id).lean();
        if (!quizComment) throw { 'message': 'QuizComment not found!', 'status': 404 };

        if (quizComment?.sender) {
            const sender = await User.findById(quizComment.sender).select('name');
            quizComment = { ...quizComment, sender };
        }
        if (quizComment?.quiz) {
            const quiz = await Quiz.findById(quizComment.quiz).select('title');
            quizComment = { ...quizComment, quiz };
        }

        res.status(200).json(quizComment);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getCommentsByQuiz = async (req, res) => {
    try {
        const cacheKey = `quizComments_${req.params.id}`;
        const cachedData = await getCachedData(cacheKey);
        if (cachedData) return res.status(200).json(cachedData);

        let quizComments = await QuizComment.find({ quiz: req.params.id }).sort({ createdAt: -1 }).lean();
        const expandedComments = await expandComments(quizComments);
        quizComments = expandedComments ? expandedComments : quizComments;

        await setCachedData(cacheKey, quizComments) && keysToClear.add(cacheKey);
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
        if (!savedQuizComment) throw { message: 'Something went wrong while creating!!', status: 500 };

        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(savedQuizComment);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateQuizComment = async (req, res) => {
    try {
        const quizComment = await QuizComment.findById(req.params.id);
        if (!quizComment) throw { message: 'QuizComment not found!', status: 404 };

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
        if (!quizComment) throw { message: 'QuizComment not found!', status: 404 };

        const updatedQuizComment = await QuizComment.findByIdAndUpdate(commentID, { status: req.body.status }, { new: true });
        res.status(200).json(updatedQuizComment);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteQuizComment = async (req, res) => {
    try {
        const quizComment = await QuizComment.findById(req.params.id);
        if (!quizComment) throw { message: 'QuizComment not found!', status: 404 };

        const removedQuizComment = await QuizComment.deleteOne({ _id: req.params.id });
        if (removedQuizComment.deletedCount === 0) throw { message: 'Something went wrong while deleting!', status: 500 };

        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(quizComment);
    } catch (err) {
        handleError(res, err);
    }
};
