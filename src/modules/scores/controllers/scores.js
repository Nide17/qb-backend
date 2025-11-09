const { redisCache, getCachedData, setCachedData } = require('../../../utils/global-helpers');
const { getBatchedQuizzes } = require('../../quizzing/helpers');
const User = require('../../users/models/User');
const Quiz = require('../../quizzing/models/Quiz');
const { expandScores } = require('../helpers');
const Score = require('../models/Score');
const { handleError } = require('../../../utils/error');

const keysToClear = new Set();
exports.getScores = async (req, res) => {

    try {
        // Pagination - ENFORCE pagination to prevent memory exhaustion
        const totalScores = await Score.countDocuments({});
        var PAGE_SIZE = 20;
        var pageNo = parseInt(req.query.pageNo || '1'); // Default to at most 1 page to avoid mem leak
        var query = {};

        // Always enforce pagination - never load all scores
        query.limit = PAGE_SIZE;
        query.skip = PAGE_SIZE * (pageNo - 1);

        if (req.query?.filter === 'stats') return res.status(200).json(totalScores);

        const cacheKey = `scores_${query.limit}_${query.skip}`;
        const cached = await getCachedData(cacheKey);
        // if (cached) return res.status(200).json(cached);

        // Always use pagination to prevent memory exhaustion
        let scores = await Score.find({}, {}, query).sort({ test_date: -1 }).lean();
        if (!scores || scores.length === 0) throw { 'status': 404, 'message': 'No scores found' };

        // Expand scores
        const expandedScores = await expandScores(scores);
        const result = { scores: expandedScores || scores, totalPages: Math.ceil(totalScores / PAGE_SIZE), currentPage: pageNo, pageSize: PAGE_SIZE, totalScores };

        await setCachedData(cacheKey, result) && keysToClear.add(cacheKey);
        res.status(200).json(result);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getScoresByTaker = async (req, res) => {

    try {
        if (!req.params?.id) throw { 'status': 400, 'message': 'User ID is required' };

        const cacheKey = `scores_user_${req.params.id}`;
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);

        let scores = await Score.find({ taken_by: req.params.id }).sort({ test_date: -1 }).lean();
        if (!scores || scores.length === 0) throw { 'status': 404, 'message': 'You have no scores. Take some quizzes!' };

        // Expand scores
        const expandedScores = await expandScores(scores);
        const result = expandedScores || scores;
        await setCachedData(cacheKey, result) && keysToClear.add(cacheKey);
        res.status(200).json(result);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getScoresForQuizCreator = async (req, res) => {
    try {
        if (!req.params?.id) throw { 'status': 400, 'message': 'User ID is required' };

        // Add pagination to prevent memory exhaustion
        const PAGE_SIZE = 50; // Larger page size for creators but still limited
        const pageNo = parseInt(req.query.pageNo || '1');
        const skip = PAGE_SIZE * (pageNo - 1);

        const cacheKey = `scores_quiz_${req.params.id}`;
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);

        const totalScores = await Score.countDocuments({});
        let scores = await Score.find().skip(skip).limit(PAGE_SIZE).sort({ test_date: -1 }).lean();
        if (!scores || scores.length === 0) throw { status: 404, message: '404' };

        // Expand scores
        const expandedScores = await expandScores(scores);
        const result = { scores: expandedScores || scores, totalPages: Math.ceil(totalScores / PAGE_SIZE), currentPage: pageNo, pageSize: PAGE_SIZE, totalScores };

        await setCachedData(cacheKey, result) && keysToClear.add(cacheKey);
        res.status(200).json(result);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneScore = async (req, res) => {

    try {
        let score = await Score.findOne({ id: req.params?.id }).lean();
        if (!score) score = await Score.findById(req.params?.id).lean();
        if (!score) throw { status: 404, message: 'Score not found!' };

        if (score.taken_by) {
            const user = await User.findById(score.taken_by).select('name image').lean();
            score.taken_by = user || score.taken_by;
        }
        if (score.quiz) {
            const quiz = await Quiz.findById(score.quiz).select('title category').populate('category', 'title').lean();
            score.quiz = quiz || score.quiz;
            score.category = quiz?.category || score.category;
        }
        res.status(200).json(score);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getQuizRanking = async (req, res) => {
    try {
        if (!req.params?.id) throw { 'status': 400, 'message': 'Quiz ID is required' };

        const cacheKey = `ranking_${req.params.id}`;
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);

        let scores = await Score.find({ quiz: req.params.id }).sort({ marks: -1 }).limit(20).lean();
        if (!scores || scores.length === 0) throw { 'status': 404, 'message': 'No scores to display' };

        // Expand scores
        const expandedScores = await expandScores(scores);
        const result = expandedScores || scores;
        await setCachedData(cacheKey, result) && keysToClear.add(cacheKey);
        res.status(200).json(result);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getPopularQuizzes = async (req, res) => {

    try {
        const cacheKey = 'popular_quizzes';
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        let popularQuizzes = null;

        const topQuizzes = await Score.aggregate([
            { $match: { test_date: { $gte: startOfDay, $lte: endOfDay } } },
            { $group: { _id: '$quiz', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 3 }
        ]).lean();

        if (topQuizzes.length > 0) {
            const quizzesIDs = topQuizzes.map(q => q._id);
            const quizzesMap = await getBatchedQuizzes(quizzesIDs);
            popularQuizzes = topQuizzes.map(tq => {
                return quizzesMap.get(tq._id.toString()) || {};
            });
        }
        await setCachedData(cacheKey, popularQuizzes) && keysToClear.add(cacheKey);
        res.status(200).json(popularQuizzes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getMonthlyUser = async (req, res) => {

    try {
        const cacheKey = 'monthly_user';
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);

        let monthlyUserData = null;
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const endOfMonth = new Date();
        endOfMonth.setHours(23, 59, 59, 999);

        const monthlyUser = await Score.aggregate([
            { $match: { test_date: { $gte: startOfMonth, $lte: endOfMonth } } },
            { $group: { _id: '$taken_by', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 1 }
        ]).lean();

        if (monthlyUser.length > 0) {
            const user = await User.findById(monthlyUser[0]._id).select('name image');
            monthlyUserData = user && {
                uName: user.name,
                uPhoto: user.image,
                count: monthlyUser[0].count
            };
        }
        await setCachedData(cacheKey, monthlyUserData) && keysToClear.add(cacheKey);
        res.status(200).json(monthlyUserData);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createScore = async (req, res) => {

    try {
        const { id, out_of, category, quiz, review, taken_by } = req.body;
        const marks = req.body.marks ? req.body.marks : 0;
        var now = new Date();

        // Simple validation
        if (!id || !out_of || !review || !taken_by) throw { status: 400, message: '400' };
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
                let seconds = Math.round((now - testDate) / 1000);

                if (seconds < 60) throw { 'status': 400, 'message': 'Score duplicate! You took this quiz in less than a minute ago!' };
            }

            const newScore = new Score({ id, marks, out_of, test_date: now, category, quiz, review, taken_by });
            const savedScore = await newScore.save();
            if (!savedScore) throw { 'message': 'Something went wrong during creation!', 'status': 500 };

            // Clear relevant cache entries
            const cacheKeysToDelete = [`scores_user_${taken_by}`, `ranking_${quiz}`, 'popular_quizzes', 'monthly_user'];
            cacheKeysToDelete.forEach(key => cache?.delete(key));

            // Emit real-time update if socket.io is available
            if (req.io) {
                req.io.to(`user-${taken_by}`).emit('score-updated', {
                    score: savedScore,
                    type: 'new_score'
                });

                // Broadcast to quiz room for leaderboard updates
                req.io.to(`quiz-${quiz}`).emit('leaderboard-update', {
                    quizId: quiz,
                    newScore: {
                        userId: taken_by,
                        marks,
                        out_of,
                        test_date: now
                    }
                });

                // Broadcast dashboard stats update
                req.io.emit('dashboard-stats-update', {
                    type: 'new_score',
                    data: { quiz, marks, out_of, taken_by }
                });
            }
            res.status(200).json(savedScore);
            await redisCache.invalidateKeysCache(keysToClear);
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

        // Delete the Score
        const removedScore = await Score.deleteOne({ _id: req.params.id });
        if (removedScore.deletedCount === 0) throw { 'status': 500, 'message': 'Something went wrong while deleting!' };

        // Clear relevant cache entries
        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(score);
    } catch (err) {
        handleError(res, err);
    }
};


// STATISTICS CONTROLLERS
exports.getTop10QuizzingUsers = async (req, res) => {

    try {
        const cacheKey = 'top_10_quizzing_users';
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);

        let topUsers = await Score.aggregate([
            { $group: { _id: '$taken_by', totalQuizzes: { $sum: 1 }, avgMarks: { $avg: '$marks' } } },
            { $sort: { totalQuizzes: -1 } },
            { $limit: 10 }
        ]).lean();

        if (topUsers.length > 0) {

            const usersIDs = topUsers.map(u => u._id.toString());
            const usersMap = await getBatchedUsers(usersIDs);

            topUsers = topUsers.map(usr => {
                return usersMap?.get(usr?._id.toString()) || {}
            });
        }
        await setCachedData(cacheKey, topUsers) && keysToClear.add(cacheKey);
        res.status(200).json(topUsers);
    } catch (err) {
        handleError(res, err);
    }
};

// Get top quizzes by activity (by number of times taken in scores) - for statistics service
exports.getTop10Quizzes = async (req, res) => {
    try {
        // Check cache first
        const cacheKey = 'top_10_quizzes';
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);

        // Get top quizzes
        let topQuizzes = [];

        const topQuizzesData = await Score.aggregate([
            { $group: { _id: '$quiz', totalTaken: { $sum: 1 } } },
            { $sort: { totalTaken: -1 } },
            { $limit: 10 }
        ]).lean();

        if (topQuizzesData.length > 0) {
            const quizzesIDs = topQuizzesData.map(q => q._id.toString());
            const quizzesMap = await getBatchedQuizzes(quizzesIDs);
            topQuizzes = topQuizzesData.map(qz => {
                return quizzesMap?.get(qz?._id.toString()) || {};
            });
        }
        await setCachedData(cacheKey, topQuizzes) && keysToClear.add(cacheKey);
        res.status(200).json(topQuizzes);
    } catch (err) {
        handleError(res, err);
    }
};
