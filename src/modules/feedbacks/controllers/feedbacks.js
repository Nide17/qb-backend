const { getModels } = require('../../../utils/db-manager');
const { handleError } = require('../../../utils/error');
const { expandFeedbacks } = require('../helpers');
const { cacheManager, cacheWrapper } = require('../../../utils/global-helpers');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "fdb:all",
    ONE: (id) => `fdb:${id}`,
    PAGINATED: (pageNo) => `fdb:page:${pageNo}`
};

exports.getFeedbacks = async (req, res) => {

    try {
        const { Feedback } = await getModels('feedbacks');
        const totalPages = await Feedback.countDocuments({});
        const PAGE_SIZE = 20;
        var pageNo = parseInt(req.query.pageNo || '0');
        var query = {};

        query.limit = PAGE_SIZE;
        query.skip = pageNo > 0 ? (pageNo - 1) * PAGE_SIZE : 0;

        if (pageNo && pageNo > 0) {
            const cacheKey = CACHE_KEYS.PAGINATED(pageNo);
            const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
                let feedbacks = await Feedback.find({}, {}, query).sort({ createdAt: -1 }).lean();
                if (!feedbacks || feedbacks.length === 0) throw { 'message': 'No feedbacks found!', 'status': 404 };

                const expandedFeedbacks = await expandFeedbacks(feedbacks);
                const result = { feedbacks: expandedFeedbacks || feedbacks, totalPages: Math.ceil(totalPages / PAGE_SIZE) };
                return result;
            })
            return res.status(200).json(data);
        }
        else {
            const cacheKey = CACHE_KEYS.ALL;
            const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
                const feedbacks = await Feedback.find().sort({ createdAt: -1 }).lean();
                const expandedFeedbacks = await expandFeedbacks(feedbacks);
                return expandedFeedbacks || feedbacks;
            })
            return res.status(200).json(data);
        }
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneFeedback = async (req, res) => {
    try {

        const cacheKey = CACHE_KEYS.ONE(req.params.id);

        const { Feedback } = await getModels('feedbacks');
        const { Quiz } = await getModels('quizzing');
        const { User } = await getModels('users');
        const { Score } = await getModels('scores');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
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
            return feedback;
        })

        return res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createFeedback = async (req, res) => {
    try {
        const { Feedback } = await getModels('feedbacks');

        const newFeedback = new Feedback(req.body);
        const savedFeedback = await newFeedback.save();
        await cacheManager.invalidatePattern("fdb:*");
        res.status(201).json(savedFeedback);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateFeedback = async (req, res) => {
    try {
        const { Feedback } = await getModels('feedbacks');

        const updatedFeedback = await Feedback.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        if (!updatedFeedback) throw { 'message': 'Feedback not found!', 'status': 404 };

        await cacheManager.invalidatePattern("fdb:*");
        res.status(200).json(updatedFeedback);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteFeedback = async (req, res) => {
    try {
        const { Feedback } = await getModels('feedbacks');

        const feedback = await Feedback.findById(req.params.id);
        if (!feedback) throw { 'message': 'Feedback not found!', 'status': 404 };
        const removedFeedback = await feedback.deleteOne();
        if (removedFeedback.deletedCount === 0) throw { 'message': 'Something went wrong while deleting!', 'status': 503 };

        await cacheManager.invalidatePattern("fdb:*");
        res.status(200).json(feedback);
    } catch (err) {
        handleError(res, err);
    }
};
