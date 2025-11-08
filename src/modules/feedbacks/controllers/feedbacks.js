const Feedback = require('../models/Feedback');
const Quiz = require('../../quizzing/models/Quiz');
const User = require('../../users/models/User');
const Score = require('../../scores/models/Score');
const { handleError } = require('../../../utils/error');
const { expandFeedbacks } = require('../helpers');
const { redisCache, getCachedData, setCachedData } = require('../../../utils/global-helpers');

const keysToClear = new Set();
exports.getFeedbacks = async (req, res) => {

    try {
        const totalPages = await Feedback.countDocuments({});
        const PAGE_SIZE = 20;
        var pageNo = parseInt(req.query.pageNo || '1');
        var query = {};

        query.limit = PAGE_SIZE;
        query.skip = PAGE_SIZE * (pageNo - 1);

        const cacheKey = `feedbacks_${query.limit}_${query.skip}`;
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);

        // Get feedbacks
        let feedbacks = await Feedback.find({}, {}, query).sort({ createdAt: -1 }).lean();
        if (!feedbacks || feedbacks.length === 0) throw { 'message': 'No feedbacks found!', 'status': 204 };

        // Expand feedback details
        const expandedFeedbacks = await expandFeedbacks(feedbacks);
        const result = { feedbacks: expandedFeedbacks || feedbacks, totalPages: Math.ceil(totalPages / PAGE_SIZE) };
        await setCachedData(cacheKey, result) && keysToClear.add(cacheKey);
        res.status(200).json(result);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneFeedback = async (req, res) => {
    try {
        let feedback = await Feedback.findById(req.params.id).select('quiz score user comment rating').lean();
        if (!feedback) throw { 'message': 'Feedback not found!', 'status': 404 };

        if (feedback?.quiz) {
            const quiz = await Quiz.findById(feedback?.quiz).select('title');
            feedback = { ...feedback, quiz: quiz };
        }
        if (feedback?.user) {
            const user = await User.findById(feedback?.user);
            feedback = { ...feedback, user: user };
        }
        if (feedback?.score) {
            const score = await Score.findById(feedback?.score).select('id marks out_of');
            feedback = { ...feedback, score: score };
        }
        res.status(200).json(feedback);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createFeedback = async (req, res) => {
    try {
        const newFeedback = new Feedback(req.body);
        const savedFeedback = await newFeedback.save();

        await redisCache.invalidateKeysCache(keysToClear);
        res.status(201).json(savedFeedback);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateFeedback = async (req, res) => {
    try {
        const updatedFeedback = await Feedback.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedFeedback) {
            throw { 'message': 'Feedback not found!', 'status': 404 };
        }
        res.status(200).json(updatedFeedback);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteFeedback = async (req, res) => {
    try {
        const feedback = await Feedback.findById(req.params.id);

        if (!feedback) {
            throw { 'message': 'Feedback not found!', 'status': 404 };
        }

        const removedFeedback = await feedback.deleteOne();

        if (removedFeedback.deletedCount === 0) {
            throw { 'message': 'Something went wrong while deleting!', 'status': 503 };
        }

        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(feedback);
    } catch (err) {
        handleError(res, err);
    }
};
