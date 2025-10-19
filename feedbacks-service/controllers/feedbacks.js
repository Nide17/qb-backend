const Feedback = require("../models/Feedback");
const { handleError } = require('../utils/error');
const { populateFeedbackDetails } = require('../utils/helpers');

// Helper function for pagination
const getPagination = (pageNo, pageSize) => {
    const limit = pageSize;
    const skip = pageSize * (pageNo - 1);
    return { limit, skip };
};

exports.getFeedbacks = async (req, res) => {

    const totalPages = await Feedback.countDocuments({});
    const PAGE_SIZE = 20;
    const pageNo = parseInt(req.query.pageNo || "0");
    const query = getPagination(pageNo, PAGE_SIZE);

    try {
        let feedbacks = pageNo > 0 ?
            await Feedback.find({}, {}, query).sort({ createdAt: -1 }).exec() :
            await Feedback.find().sort({ createdAt: -1 }).exec();

        if (!feedbacks) {
            return res.status(204).json({ message: 'No feedbacks found!' });
        }

        if (pageNo > 0) {
            res.status(200).json({
                feedbacks: feedbacks,
                totalPages: Math.ceil(totalPages / PAGE_SIZE)
            });
        } else {
            res.status(200).json(feedbacks);
        }
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneFeedback = async (req, res) => {
    try {
        let feedback = await Feedback.findById(req.params.id).select('quiz score user comment rating');
        if (!feedback) return res.status(404).json({ message: 'No feedback found!' });

        feedback = await populateFeedbackDetails(feedback) || feedback;
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
            return res.status(404).json({ message: 'Feedback not found!' });
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
            return res.status(404).json({ message: 'Feedback not found!' });
        }

        const removedFeedback = await feedback.deleteOne();

        if (removedFeedback.deletedCount === 0) {
            return res.status(503).json({ message: 'Something went wrong while deleting!' });
        }
        res.status(200).json(feedback);
    } catch (err) {
        handleError(res, err);
    }
};
