const axios = require('axios');
const Score = require("../models/Score");
const { handleError } = require('../utils/error');
const { callService, getCachedData, setCachedData, cache, findScoreById, populateScore } = require('../utils/helpers');

exports.getScores = async (req, res) => {

    try {
        // Pagination - ENFORCE pagination to prevent memory exhaustion
        const totalScores = await Score.countDocuments({})
        var PAGE_SIZE = 20
        var pageNo = parseInt(req.query.pageNo || "1") // Default to at most 1 page to avoid mem leak
        var query = {}

        // Always enforce pagination - never load all scores
        query.limit = PAGE_SIZE
        query.skip = PAGE_SIZE * (pageNo - 1)

        // Always use pagination to prevent memory exhaustion
        let scores = await Score.find({}, {}, query).sort({ test_date: -1 }).lean();

        if (!scores || scores.length === 0) {
            return res.status(204).json({
                message: 'No scores found'
            });
        }

        if (req.query?.filter === 'stats') {
            console.log("Returning only stats: ", totalScores)
            return res.status(200).json(totalScores)
        }

        // Populate scores
        for (let i = 0; i < scores.length; i++) {
            scores[i] = await populateScore(scores[i]);
        }

        return res.status(200).json({
            totalPages: Math.ceil(totalScores / PAGE_SIZE),
            currentPage: pageNo,
            pageSize: PAGE_SIZE,
            totalScores,
            scores
        });

    } catch (err) {
        // Check if this is a memory exhaustion error
        if (err.message && err.message.includes('JavaScript heap out of memory')) {
            return res.status(500).json({ message: 'Memory exhaustion error' });
        }
        handleError(res, err);
    }
}

exports.getScoresByTaker = async (req, res) => {

    let id = req.params.id;
    const cacheKey = `scores_user_${id}`;

    try {
        // Check cache first
        let scores = getCachedData(cacheKey);

        if (!scores || scores.length === 0) {
            scores = await Score.find({ taken_by: id }).sort({ test_date: -1 }).exec();
            if (!scores || scores.length === 0) return res.status(404).json({ message: 'You have no scores. Take some quizzes!' });

            // Populate scores
            for (let i = 0; i < scores.length; i++) {
                scores[i] = await populateScore(scores[i]);
            }
            setCachedData(cacheKey, scores);
        }

        res.status(200).json(scores);
    } catch (err) {
        handleError(res, err);
    }
}

exports.getScoresForQuizCreator = async (req, res) => {
    try {
        // Add pagination to prevent memory exhaustion
        const PAGE_SIZE = 50; // Larger page size for creators but still limited
        const pageNo = parseInt(req.query.pageNo || "1");
        const skip = PAGE_SIZE * (pageNo - 1);

        const totalScores = await Score.countDocuments({});
        let scores = await Score.find().skip(skip).limit(PAGE_SIZE).sort({ test_date: -1 }).exec();

        if (!scores || scores.length === 0) {
            return res.status(404).json({
                message: 'No scores found',
                page: pageNo,
                totalPages: Math.ceil(totalScores / PAGE_SIZE)
            });
        }

        // Populate scores
        for (let i = 0; i < scores.length; i++) {
            scores[i] = await populateScore(scores[i]);
        }

        res.status(200).json({
            totalPages: Math.ceil(totalScores / PAGE_SIZE),
            currentPage: pageNo,
            pageSize: PAGE_SIZE,
            totalScores: totalScores,
            scores
        });
    } catch (err) {
        // Check if this is a memory exhaustion error
        if (err.message && err.message.includes('JavaScript heap out of memory')) {
            return res.status(500).json({ message: 'Memory exhaustion error' });
        }
        console.log('\n\nError retrieving scores for quiz creator: ', err);
        handleError(res, err);
    }
}

exports.getOneScore = async (req, res) => {

    try {
        const score = await findScoreById(req.params.id, '');
        if (!score) return res.status(404).json({ message: 'Score not found!' });
        res.status(200).json(score);
    } catch (err) {
        handleError(res, err);
    }
}

exports.getQuizRanking = async (req, res) => {
    let id = req.params.id;
    const cacheKey = `ranking_${id}`;

    try {
        // Check cache first
        let scores = getCachedData(cacheKey);

        if (!scores || scores.length === 0) {
            scores = await Score.find({ quiz: id }).sort({ marks: -1 }).limit(20).exec();
            if (!scores || scores.length === 0) {
                console.warn(`No scores found for the ${id} quiz`);
                return res.status(404).json({ message: 'No scores to display' });
            }

            // Populate scores
            for (let i = 0; i < scores.length; i++) {
                scores[i] = await populateScore(scores[i]);
            };
            setCachedData(cacheKey, scores);
        }

        res.status(200).json(scores);
    } catch (err) {
        handleError(res, err);
    }
}

exports.getPopularQuizzes = async (req, res) => {
    const cacheKey = 'popular_quizzes';

    try {
        // Check cache first
        let popularQuizzes = getCachedData(cacheKey);

        if (!popularQuizzes || popularQuizzes.length === 0) {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);

            const endOfDay = new Date();
            endOfDay.setHours(23, 59, 59, 999);

            const topQuizzes = await Score.aggregate([
                { $match: { test_date: { $gte: startOfDay, $lte: endOfDay } } },
                { $group: { _id: "$quiz", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 3 }
            ]).exec();

            if (topQuizzes.length > 0) {
                const quizIds = topQuizzes.map(q => q._id);
                let quizzes = await callService(`${process.env.QUIZZING_SERVICE_URL}/api/quizzes/?ids=${quizIds.join(',')}`);

                popularQuizzes = topQuizzes.map(pq => {
                    const quiz = quizzes?.find(q => String(q._id) === String(pq._id));
                    return {
                        _id: pq._id,
                        qTitle: quiz?.title || 'Unknown Quiz',
                        slug: quiz?.slug || '',
                        count: pq.count
                    };
                });
            } else {
                popularQuizzes = [];
            }

            setCachedData(cacheKey, popularQuizzes);
        }

        res.json(popularQuizzes);
    } catch (err) {
        console.log('\n\nError retrieving popular quizzes: ', err);
        handleError(res, err);
    }
}

exports.getMonthlyUser = async (req, res) => {
    const cacheKey = 'monthly_user';

    try {
        // Check cache first
        let monthlyUserData = getCachedData(cacheKey);

        if (!monthlyUserData || monthlyUserData.length === 0) {
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            const endOfMonth = new Date();
            endOfMonth.setHours(23, 59, 59, 999);

            const monthlyUser = await Score.aggregate([
                { $match: { test_date: { $gte: startOfMonth, $lte: endOfMonth } } },
                { $group: { _id: "$taken_by", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 1 }
            ]).exec();

            if (monthlyUser.length > 0) {
                try {
                    const user = await callService(`${process.env.USERS_SERVICE_URL}/api/users/${monthlyUser[0]._id}`, 60000);

                    monthlyUserData = user && {
                        uName: user.name,
                        uPhoto: user.image,
                        count: monthlyUser[0].count
                    };
                } catch (usererr) {
                    console.log('Error fetching user data:', usererr);
                    monthlyUserData = null;
                }
            } else {
                monthlyUserData = null;
            }

            setCachedData(cacheKey, monthlyUserData);
        }

        res.json(monthlyUserData);
    } catch (err) {
        console.log('\n\nError retrieving monthly user: ', err);
        handleError(res, err);
    }
}

exports.createScore = async (req, res) => {

    const { id, out_of, category, quiz, review, taken_by } = req.body
    const marks = req.body.marks ? req.body.marks : 0
    var now = new Date()

    // Simple validation
    if (!id || !out_of || !review || !taken_by) {
        const missing = !id ? 'Error' : !out_of ? 'No total' : !review ? 'No review' : !taken_by ? 'Not logged in' : 'Wrong'
        return res.status(400).json({ message: missing + '!' })
    }

    else {
        try {
            // Use Promise.all for parallel queries to improve performance
            const [existingScore, recentScoreExist] = await Promise.all([
                Score.find({ id: id }),
                Score.find({ taken_by }, {}, { sort: { 'test_date': -1 }, limit: 1 })
            ]);

            if (existingScore.length > 0) {
                return res.status(400).json({
                    message: 'Score duplicate! You have already saved this score!'
                })
            }

            if (recentScoreExist.length > 0) {
                // Check if the score was saved within 60 seconds
                let testDate = new Date(recentScoreExist[0].test_date)
                let seconds = Math.round((now - testDate) / 1000)

                if (seconds < 60) {
                    return res.status(400).json({
                        message: 'Score duplicate! You took this quiz in less than a minute ago!'
                    })
                }
            }

            const newScore = new Score({
                id,
                marks,
                out_of,
                test_date: now,
                category,
                quiz,
                review,
                taken_by
            })

            const savedScore = await newScore.save()

            if (!savedScore) throw new Error('Something went wrong during creation!');

            // Clear relevant cache entries
            const cacheKeysToDelete = [`scores_user_${taken_by}`, `ranking_${quiz}`, 'popular_quizzes', 'monthly_user'];
            cacheKeysToDelete.forEach(key => cache.delete(key));

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

            res.status(200).json({
                _id: savedScore._id,
                id: savedScore.id,
                marks: savedScore.marks,
                out_of: savedScore.out_of,
                test_date: savedScore.test_date,
                category: savedScore.category,
                quiz: savedScore.quiz,
                review: savedScore.review,
                taken_by: savedScore.taken_by
            })
        } catch (err) {
            console.log('Error creating score: ', err);
            handleError(res, err);
        }
    }
}

exports.deleteScore = async (req, res) => {
    try {

        //Find the Score to delete by id first
        const score = await Score.findOne({ _id: req.params.id })

        if (!score) return res.status(404).json({ message: 'No scores found' });

        // Delete the Score
        const removedScore = await Score.deleteOne({ _id: req.params.id })

        if (!removedScore) throw new Error('Something went wrong while deleting!');

        res.status(200).json(score)
    }

    catch (err) {
        console.log('Error deleting score: ', err);
        handleError(res, err);
    }
}


// STATISTICS CONTROLLERS
exports.getTop10QuizzingUsers = async (req, res) => {

    const cacheKey = 'top_10_quizzing_users';
    try {
        // Check cache first
        let topUsers = getCachedData(cacheKey);

        if (!topUsers || topUsers.length === 0) {

            let topUsers = await Score.aggregate([
                { $group: { _id: "$taken_by", totalQuizzes: { $sum: 1 }, avgMarks: { $avg: "$marks" } } },
                { $sort: { totalQuizzes: -1 } },
                { $limit: 10 }
            ]).exec();

            if (topUsers.length > 0) {

                const userIds = topUsers.map(u => u._id.toString());
                const users = await axios.post(`${process.env.USERS_SERVICE_URL}/api/users/batch`, { userIds }, 200000);

                topUsers = topUsers.map(usr => {
                    const user = users?.data?.find(u => u._id === usr._id.toString()) || {};
                    return {
                        _id: usr._id,
                        name: user.name || 'Unknown User',
                        email: user.email || '',
                        totalQuizzes: usr.totalQuizzes,
                        avgMarks: Math.round(usr.avgMarks * 10) / 10
                    };
                });
                setCachedData(cacheKey, topUsers);
            }
        }
        res.json(topUsers);
    } catch (err) {
        console.log('\n\nError retrieving top users by quizzes:', err);
        handleError(res, err);
    }
};

// Get top quizzes by activity (by number of times taken in scores) - for statistics service
exports.getTop10Quizzes = async (req, res) => {
    const cacheKey = 'top_10_quizzes';
    try {
        // Check cache first
        let topQuizzes = getCachedData(cacheKey);

        if (!topQuizzes || topQuizzes.length === 0) {

            const topQuizzesData = await Score.aggregate([
                { $group: { _id: "$quiz", totalTaken: { $sum: 1 } } },
                { $sort: { totalTaken: -1 } },
                { $limit: 10 }
            ]).exec();

            if (topQuizzesData.length > 0) {

                const quizIds = topQuizzesData.map(q => q._id.toString());
                const quizzes = await axios.post(`${process.env.QUIZZING_SERVICE_URL}/api/quizzes/batch`, { quizIds }, 200000);

                topQuizzes = topQuizzesData.map(qz => {
                    const quiz = quizzes?.data?.find(q => String(q._id) === String(qz._id)) || {};
                    return {
                        _id: qz._id,
                        title: quiz.title || 'Unknown Quiz',
                        category: quiz.category || 'Uncategorized',
                        slug: quiz.slug || '',
                        totalTaken: qz.totalTaken
                    };
                });
                setCachedData(cacheKey, topQuizzes);
            }
        }
        res.json(topQuizzes);
    } catch (err) {
        console.log('\n\nError retrieving top quizzes:', err);
        handleError(res, err);
    }
}
