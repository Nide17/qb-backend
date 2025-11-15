const Quiz = require('../models/Quiz');
const Category = require('../models/Category');
const Question = require('../models/Question');
const User = require('../../users/models/User');
const SubscribedUser = require('../../users/models/SubscribedUser');

const { handleError } = require('../../../utils/error');
const { sendEmail } = require('../../../utils/emails/sendEmail');
const { getBatchedQuizzesMap } = require('../helpers');
const { cacheManager, cacheWrapper } = require('../../../utils/global-helpers');

const CACHE_TTL = 3600; // 1 hour
const CACHE_KEYS = {
    ALL: "qz:all",
    LIMITED: (limit, skip) => `qz:limited:${limit}:${skip}`,
    PAGINATED: (pageNo) => `qz:paginated:${pageNo}`,
    BY_CATEGORY: (categoryId) => `qz:by_category:${categoryId}`,
    BY_USER: (userId) => `qz:by_user:${userId}`,
    BY_NOTES: (notes) => `qz:by_notes:${notes}`,
    ONE: (id) => `qz:${id}`,
};

// ------------------------------------------------------------------------------
// GET QUIZZES
// ------------------------------------------------------------------------------
exports.getQuizzes = async (req, res) => {
    try {
        const pageNo = parseInt(req.query.pageNo);
        const limit = parseInt(req.query.limit);
        const skip = parseInt(req.query.skip) || 0;

        // LIMITED QUERY ----------------------------------------------------------
        if (limit) {
            const cacheKey = CACHE_KEYS.LIMITED(limit, skip);
            const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
                const quizzes = await Quiz.find({})
                    .sort({ creation_date: -1 })
                    .populate('category questions')
                    .limit(limit)
                    .skip(skip);

                if (!quizzes.length) throw { message: 'No quizzes found!', status: 404 };
                return quizzes;
            });

            return res.status(200).json(data);
        }

        // PAGINATED --------------------------------------------------------------
        if (pageNo && pageNo > 0) {
            const PAGE_SIZE = 20;
            const cacheKey = CACHE_KEYS.PAGINATED(pageNo);

            const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
                const totalQuizzes = await Quiz.countDocuments();

                const quizzes = await Quiz.find({})
                    .sort({ creation_date: -1 })
                    .limit(PAGE_SIZE)
                    .skip(PAGE_SIZE * (pageNo - 1))
                    .populate('category questions')
                    .lean();

                if (!quizzes.length) throw { message: 'No quizzes found', status: 204 };

                return {
                    totalPages: Math.ceil(totalQuizzes / PAGE_SIZE),
                    currentPage: pageNo,
                    pageSize: PAGE_SIZE,
                    totalQuizzes,
                    paginatedQuizzes: quizzes,
                };
            });

            return res.status(200).json(data);
        }

        // FULL LIST --------------------------------------------------------------
        const cacheKey = CACHE_KEYS.ALL;

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const quizzes = await Quiz.find({})
                .sort({ creation_date: -1 })
                .populate('category questions');

            if (!quizzes.length) throw { message: 'No quizzes found!', status: 204 };
            return quizzes;
        });

        res.status(200).json(data);

    } catch (err) {
        handleError(res, err);
    }
};

// ------------------------------------------------------------------------------
// GET ONE QUIZ
// ------------------------------------------------------------------------------
exports.getOneQuiz = async (req, res) => {
    try {
        const id = req.params.id;
        const query = /^[0-9a-fA-F]{24}$/.test(id) ? { _id: id } : { slug: id };

        const quiz = await Quiz.findOne(query)
            .populate('category questions', 'title questionText')
            .select('-__v')
            .lean();

        if (!quiz) throw { status: 404, message: `Quiz with id ${id} not found` };

        const owner = await User.findById(quiz.created_by).select('name image').lean();
        quiz.created_by = owner;

        res.status(200).json(quiz);

    } catch (err) {
        handleError(res, err);
    }
};

// ------------------------------------------------------------------------------
// GET QUIZZES BY CATEGORY
// ------------------------------------------------------------------------------
exports.getQuizzesByCategory = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.BY_CATEGORY(req.params.id);

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            let quizzes = await Quiz.find({ category: req.params.id })
                .populate('category questions');

            if (!quizzes.length) throw { message: 'No quizzes found', status: 204 };

            const ids = quizzes.map(q => q._id);
            const map = await getBatchedQuizzesMap(ids);

            return quizzes.map(q => map.get(q._id.toString()) || q);
        });

        res.status(200).json(data);

    } catch (err) {
        handleError(res, err);
    }
};

// ------------------------------------------------------------------------------
// GET QUIZZES BY NOTES CATEGORY
// ------------------------------------------------------------------------------
exports.getQuizzesByNotes = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.BY_NOTES(req.params.id);

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const categories = await Category.find({ category: req.params.id });
            const quizzes = await Quiz.find({ category: { $in: categories } })
                .populate('category questions');

            if (!quizzes.length) throw { message: 'No quizzes found!', status: 204 };

            const ids = quizzes.map(q => q._id);
            const map = await getBatchedQuizzesMap(ids);
            return quizzes.map(q => map.get(q._id.toString()) || q);
        });

        res.status(200).json(data);

    } catch (err) {
        handleError(res, err);
    }
};

// ------------------------------------------------------------------------------
// CREATE QUIZ
// ------------------------------------------------------------------------------
exports.createQuiz = async (req, res) => {
    try {
        const { title, description, category, created_by } = req.body;

        if (!title || !description || !category)
            throw { message: 'Missing required fields', status: 400 };

        const exists = await Quiz.findOne({ title });
        if (exists) throw { message: 'Quiz already exists!', status: 400 };

        const newQuiz = new Quiz({ title, description, category, created_by });

        // Atomic category update
        const categoryUpdate = await Category.findByIdAndUpdate(
            category,
            { $addToSet: { quizes: newQuiz._id } },
            { new: true }
        );

        if (!categoryUpdate) throw { message: 'Cannot update category!', status: 400 };

        const saved = await newQuiz.save();
        await cacheManager.invalidatePattern("cat:*");
        await cacheManager.invalidatePattern("qz:*");
        res.status(200).json(saved);

    } catch (err) {
        handleError(res, err);
    }
};

// ------------------------------------------------------------------------------
// SEND NOTIFICATIONS
// ------------------------------------------------------------------------------
exports.notifying = async (req, res) => {
    try {
        const cacheKey = 'subscribed_users';

        const subscribers = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () =>
            SubscribedUser.find({})
        );

        const { slug, title, category, created_by } = req.body;
        const clientURL = req.headers.origin;

        subscribers.forEach(sub => {
            sendEmail(
                sub.email,
                `Updates!! new ${category} quiz that may interest you`,
                {
                    name: sub.name,
                    author: created_by,
                    quizTitle: title,
                    quizLink: `${clientURL}/view-quiz/${slug}`,
                    unsubLink: `${clientURL}/unsubscribe`
                },
                './template/newquiz.handlebars'
            );
        });

        res.status(200).json({ slug, title, category, created_by });

    } catch (err) {
        handleError(res, err);
    }
};

// ------------------------------------------------------------------------------
// UPDATE QUIZ
// ------------------------------------------------------------------------------
exports.updateQuiz = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) throw { message: 'Quiz not found', status: 404 };

        const updated = await Quiz.updateOne(
            { _id: req.params.id },
            { $set: req.body }
        );

        // If category changed
        if (req.body?.oldCategoryID) {
            await Category.updateOne(
                { _id: req.body.oldCategoryID },
                { $pull: { quizes: quiz._id } }
            );

            await Category.updateOne(
                { _id: req.body.category },
                { $addToSet: { quizes: quiz._id } }
            );
        }

        await cacheManager.invalidatePattern("cat:*");
        await cacheManager.invalidatePattern("qz:*");
        res.status(200).json(updated);

    } catch (err) {
        handleError(res, err);
    }
};

// ------------------------------------------------------------------------------
// ADD VIDEO LINK
// ------------------------------------------------------------------------------
exports.addVidLink = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) throw { message: 'Quiz not found', status: 404 };

        quiz.video_links.push(req.body);
        await quiz.save();

        await cacheManager.invalidatePattern("cat:*");
        await cacheManager.invalidatePattern("qz:*");
        res.status(200).json(quiz);

    } catch (err) {
        handleError(res, err);
    }
};

// ------------------------------------------------------------------------------
// DELETE QUIZ
// ------------------------------------------------------------------------------
exports.deleteQuiz = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) throw { message: 'Quiz not found', status: 404 };

        await Category.updateOne(
            { _id: quiz.category },
            { $pull: { quizes: quiz._id } }
        );

        await Question.deleteMany({ quiz: quiz._id });
        await Quiz.deleteOne({ _id: quiz._id });

        await cacheManager.invalidatePattern("cat:*");
        await cacheManager.invalidatePattern("qz:*");
        res.status(200).json(quiz);

    } catch (err) {
        handleError(res, err);
    }
};

// ------------------------------------------------------------------------------
// DELETE VIDEO
// ------------------------------------------------------------------------------
exports.deleteVideo = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) throw { message: 'Quiz not found', status: 404 };

        quiz.video_links.id(req.body.vId)?.remove();
        await quiz.save();

        await cacheManager.invalidatePattern("cat:*");
        await cacheManager.invalidatePattern("qz:*");
        res.status(200).json(quiz);

    } catch (err) {
        handleError(res, err);
    }
};

// ------------------------------------------------------------------------------
// DATABASE STATS
// ------------------------------------------------------------------------------
exports.getDatabaseStats = async (req, res) => {
    try {
        const cacheKey = 'quizzes_db_stats';

        const data = await cacheWrapper.wrap(cacheKey, 900, async () => {
            const db = Quiz.db;

            const quizzesCol = db.collection('quizzes');
            const questionsCol = db.collection('questions');
            const categoriesCol = db.collection('categories');

            const quizzesCount = await quizzesCol.countDocuments();
            const questionsCount = await questionsCol.countDocuments();
            const categoriesCount = await categoriesCol.countDocuments();

            const sample = await quizzesCol.find({}).limit(50).toArray();
            const avgQuizSize =
                sample.length ?
                    sample.reduce((a, doc) => a + JSON.stringify(doc).length, 0) / sample.length :
                    0;

            const estimatedQuizSize = quizzesCount * avgQuizSize;
            const estimatedQSize = questionsCount * 200;
            const estimatedCatSize = categoriesCount * 100;

            const pipeline = [
                {
                    $group: {
                        _id: null,
                        totalQuizzes: { $sum: 1 },
                        activeQuizzes: {
                            $sum: {
                                $cond: [
                                    { $gte: ['$creation_date', new Date(Date.now() - 30 * 86400000)] },
                                    1,
                                    0
                                ]
                            }
                        },
                        avgQuestionsPerQuiz: { $avg: { $size: '$questions' } }
                    }
                }
            ];

            const aggregate = await quizzesCol.aggregate(pipeline).toArray();
            const quizMetrics = aggregate[0] || {};

            const totalData = estimatedQuizSize + estimatedQSize + estimatedCatSize;

            return {
                service: 'quizzes',
                timestamp: new Date().toISOString(),
                totalDocuments: quizzesCount + questionsCount + categoriesCount,
                totalDataSize: totalData,
                storageSize: Math.round(totalData * 1.2),
                indexSize: Math.round(totalData * 0.1),
                collections: {
                    quizzes: { documents: quizzesCount, dataSize: estimatedQuizSize, avgDocumentSize: avgQuizSize },
                    questions: { documents: questionsCount, dataSize: estimatedQSize, avgDocumentSize: 200 },
                    categories: { documents: categoriesCount, dataSize: estimatedCatSize, avgDocumentSize: 100 },
                },
                quizMetrics: {
                    totalQuizzes: quizMetrics.totalQuizzes || 0,
                    activeQuizzes: quizMetrics.activeQuizzes || 0,
                    avgQuestionsPerQuiz: Math.round(quizMetrics.avgQuestionsPerQuiz || 0)
                }
            };
        });

        res.status(200).json(data);

    } catch (err) {
        handleError(res, err);
    }
};
