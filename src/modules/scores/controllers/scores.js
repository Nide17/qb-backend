const { getBatchedQuizzesMap } = require('../../quizzing/helpers');
const { getModels } = require('../../../utils/db-manager');
const { expandScores } = require('../helpers');
const { handleError } = require('../../../utils/error');
const { cacheManager, cacheWrapper } = require('../../../utils/global-helpers');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "sc:all",
    ONE: (id) => `sc:${id}`,
    PAGINATED: (pageNo) => `sc:page:${pageNo}`,
    LIMITED: (limit, skip) => `sc:limited:${limit}:${skip}`,
    BY_TAKER: (taker) => `sc:taker:${taker}`,
    BY_CREATOR: (creator) => `sc:creator:${creator}`,
    QUIZ_RANKING: (quiz) => `sc:quiz:${quiz}`,
    POPULAR_QUIZZES: "sc:popular",
    MONTHLY_USER: "sc:monthly_user",
};

exports.getScores = async (req, res) => {

    try {
        const { Score } = await getModels('scores');

        // Pagination - ENFORCE pagination to prevent memory exhaustion
        const totalScores = await Score.countDocuments({});
        var PAGE_SIZE = 20;
        var pageNo = parseInt(req.query.pageNo || '0'); // Default to at most 1 page to avoid mem leak
        var query = {};

        // Always enforce pagination - never load all scores
        query.limit = PAGE_SIZE;
        query.skip = pageNo > 0 ? (pageNo - 1) * PAGE_SIZE : 0;

        if (req.query?.filter === 'stats') return res.status(200).json(totalScores);

        if (pageNo && pageNo > 0) {
            const cacheKey = CACHE_KEYS.PAGINATED(pageNo);

            const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
                let scores = await Score.find({}, {}, query).sort({ test_date: -1 }).lean();
                if (!scores || scores.length === 0) throw { 'status': 404, 'message': 'No scores found' };

                // Expand scores
                const expandedScores = await expandScores(scores) || scores;
                const result = { scores: expandedScores || scores, totalPages: Math.ceil(totalScores / PAGE_SIZE), currentPage: pageNo, pageSize: PAGE_SIZE, totalScores };
                return result;
            });
            return res.status(200).json(data);
        }
        else if (req.query?.limit && req.query?.skip) {
            const cacheKey = CACHE_KEYS.LIMITED(req.query.limit, req.query.skip);
            const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
                let scores = await Score.find({}, {}, query).sort({ test_date: -1 }).lean();
                if (!scores || scores.length === 0) throw { 'status': 404, 'message': 'No scores found' };

                // Expand scores
                const expandedScores = await expandScores(scores) || scores;
                const result = { scores: expandedScores || scores, totalPages: Math.ceil(totalScores / PAGE_SIZE), currentPage: pageNo, pageSize: PAGE_SIZE, totalScores };
                return result;
            });
            return res.status(200).json(data);
        }
        else {
            const cacheKey = CACHE_KEYS.ALL;
            const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
                let scores = await Score.find({}, {}, query).sort({ test_date: -1 }).lean();
                if (!scores || scores.length === 0) throw { 'status': 404, 'message': 'No scores found' };

                // Expand scores
                const expandedScores = await expandScores(scores) || scores;
                const result = { scores: expandedScores || scores, totalPages: Math.ceil(totalScores / PAGE_SIZE), currentPage: pageNo, pageSize: PAGE_SIZE, totalScores };
                return result;
            });
            return res.status(200).json(data);
        }
    } catch (err) {
        handleError(res, err);
    }
};

exports.getScoresByTaker = async (req, res) => {

    try {
        const cacheKey = CACHE_KEYS.BY_TAKER(req.params.id);
        const { Score } = await getModels('scores');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            let scores = await Score.find({ taken_by: req.params.id }).sort({ test_date: -1 }).lean();
            if (!scores || scores.length === 0) throw { 'status': 404, 'message': 'You need to take some quizzes!' };

            // Expand scores
            const result = await expandScores(scores) || scores;
            return result;
        })
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getScoresForQuizCreator = async (req, res) => {
    try {
        // Add pagination to prevent memory exhaustion
        const PAGE_SIZE = 50; // Larger page size for creators but still limited
        const pageNo = parseInt(req.query.pageNo || '0');
        const skip = pageNo > 0 ? (pageNo - 1) * PAGE_SIZE : 0;

        const cacheKey = CACHE_KEYS.BY_CREATOR(req.params.id);
        const { Score } = await getModels('scores');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const totalScores = await Score.countDocuments({});
            let scores = await Score.find().skip(skip).limit(PAGE_SIZE).sort({ test_date: -1 }).lean();
            if (!scores || scores.length === 0) throw { status: 404, message: '404' };

            // Expand scores
            const expandedScores = await expandScores(scores) || scores;
            const result = { scores: expandedScores || scores, totalPages: Math.ceil(totalScores / PAGE_SIZE), currentPage: pageNo, pageSize: PAGE_SIZE, totalScores };
            return result;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneScore = async (req, res) => {

    try {
        const id = req.params.id;
        const query = /^[0-9a-fA-F]{24}$/.test(id) ? { _id: id } : { id: id };

        const cacheKey = CACHE_KEYS.ONE(id);

        const { Score } = await getModels('scores');
        const { User } = await getModels('users');
        const { Quiz } = await getModels('quizzing');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            let score = await Score.findOne(query).lean();
            if (!score) throw { status: 404, message: 'Score not found. Save it first.' };

            if (score.taken_by) {
                const user = await User.findById(score.taken_by).select('name image').lean();
                score.taken_by = user || score.taken_by;
            }
            if (score.quiz) {
                const quiz = await Quiz.findById(score.quiz).select('title category').populate('category', 'title').lean();
                score.quiz = quiz || score.quiz;
                score.category = quiz?.category || score.category;
            }
            return score;
        })
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getQuizRanking = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.QUIZ_RANKING(req.params.id);
        const { Score } = await getModels('scores');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            let scores = await Score.find({ quiz: req.params.id }).sort({ marks: -1 }).limit(20).lean();
            if (!scores || scores.length === 0) throw { 'status': 404, 'message': 'No scores to display' };

            // Expand scores
            const result = await expandScores(scores) || scores;
            return result;
        })
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getPopularQuizzes = async (req, res) => {

    try {
        const cacheKey = CACHE_KEYS.POPULAR_QUIZZES;
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);

            const endOfDay = new Date();
            endOfDay.setHours(23, 59, 59, 999);

            let popularQuizzes = null;

            // Use native MongoDB aggregation with proper options
            const aggregationOptions = { allowDiskUse: true, maxTimeMS: 30000 };
            const { Score } = await getModels('scores');

            const topQuizzes = await Score.aggregate([
                { $match: { test_date: { $gte: startOfDay, $lte: endOfDay } } },
                { $group: { _id: '$quiz', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 3 }
            ], aggregationOptions);

            if (topQuizzes.length > 0) {
                const quizzesIDs = topQuizzes.map(q => q._id);
                const quizzesMap = await getBatchedQuizzesMap(quizzesIDs);
                popularQuizzes = topQuizzes.map(tq => quizzesMap.get(tq._id.toString()) || {});
            }
            return popularQuizzes;
        })
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getMonthlyUser = async (req, res) => {

    try {
        const cacheKey = CACHE_KEYS.MONTHLY_USER;

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            let monthlyUserData = null;
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            const endOfMonth = new Date();
            endOfMonth.setHours(23, 59, 59, 999);

            // Use native MongoDB aggregation with proper options
            const aggregationOptions = { allowDiskUse: true, maxTimeMS: 30000 };
            const { Score } = await getModels('scores');
            const { User } = await getModels('users');

            const monthlyUser = await Score.aggregate([
                { $match: { test_date: { $gte: startOfMonth, $lte: endOfMonth } } },
                { $group: { _id: '$taken_by', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 1 }
            ], aggregationOptions);

            if (monthlyUser.length > 0) {
                const user = await User.findById(monthlyUser[0]._id).select('name image');
                monthlyUserData = user && {
                    uName: user.name,
                    uPhoto: user.image,
                    count: monthlyUser[0].count
                };
            }
            return monthlyUserData;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createScore = async (req, res) => {

    try {
        const { id, out_of, marks, category, quiz, review, taken_by } = req.body;
        const { Score } = await getModels('scores');

        // Simple validation
        if (!id || !out_of || !marks || !category || !quiz || !review || !taken_by) throw { status: 400, message: 'Missing required fields!' };
        else {
            // Use Promise.all for parallel queries to improve performance
            const [existingScore, recentScoreExist] = await Promise.all([
                Score.find({ id: id }),
                Score.find({ taken_by }, {}, { sort: { 'test_date': -1 }, limit: 1 })
            ]);

            if (existingScore.length > 0) throw { 'status': 400, 'message': 'Score duplicate! You have already saved this score!' };


            if (recentScoreExist.length > 0) {
                // Check if the score was saved within 60 seconds
                let testDate = new Date(recentScoreExist[0].test_date);
                let seconds = Math.round((new Date() - testDate) / 1000);

                if (seconds < 60) throw { 'status': 400, 'message': 'Score duplicate! You took this quiz in less than a minute ago!' };
            }

            const newScore = new Score({ id, marks, out_of, category, quiz, review, taken_by });
            const savedScore = await newScore.save();
            if (!savedScore) throw { 'message': 'Something went wrong during creation!', 'status': 500 };
            await cacheManager.invalidatePattern("sc:*");
            res.status(200).json(savedScore);
        }
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteScore = async (req, res) => {
    try {
        //Find the Score to delete by id first
        const score = await Score.findOne({ _id: req.params.id });
        if (!score) throw { 'status': 404, 'message': 'No scores found' };
        const { Score } = await getModels('scores');

        // Delete the Score
        const removedScore = await Score.deleteOne({ _id: req.params.id });
        if (removedScore.deletedCount === 0) throw { 'status': 500, 'message': 'Something went wrong while deleting!' };

        await cacheManager.invalidatePattern("sc:*");
        res.status(200).json(score);
    } catch (err) {
        handleError(res, err);
    }
};
