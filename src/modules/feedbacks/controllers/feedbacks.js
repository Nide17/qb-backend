const Feedback = require('../models/Feedback');
const { handleError } = require('../../utils/error');
const { populateOneFeedback, populateBatchedFeedbacks } = require('../../utils/helpers');

exports.getFeedbacks = async (req, res) => {

    try {
        const totalPages = await Feedback.countDocuments({});
        const PAGE_SIZE = 20;
        var pageNo = parseInt(req.query.pageNo || '1');
        var query = {};

        query.limit = PAGE_SIZE;
        query.skip = PAGE_SIZE * (pageNo - 1);

        let feedbacks = await Feedback.find({}, {}, query).sort({ createdAt: -1 }).lean();

        if (!feedbacks || feedbacks.length === 0) {
            throw { 'message': 'No feedbacks found!', 'status': 204 };
        }

        // Expand feedback details
        const expandedFeedbacks = await populateBatchedFeedbacks(feedbacks);

        res.status(200).json({
            feedbacks: expandedFeedbacks || feedbacks,
            totalPages: Math.ceil(totalPages / PAGE_SIZE)
        });
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneFeedback = async (req, res) => {
    try {
        let feedback = await Feedback.findById(req.params.id).select('quiz score user comment rating');
        if (!feedback) throw { 'message': 'Feedback not found!', 'status': 404 };

        feedback = await populateOneFeedback(feedback);
        res.status(200).json(feedback);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createFeedback = async (req, res) => {
    try {
        const newFeedback = new Feedback(req.body);
        const savedFeedback = await newFeedback.save();
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
        res.status(200).json(feedback);
    } catch (err) {
        handleError(res, err);
    }
};
