const Quiz = require('../models/Quiz');
const Category = require('../models/Category');
const Question = require('../models/Question');
const User = require('../../users/models/User');
const { handleError } = require('../../../utils/error');
const { sendEmail } = require('../../../utils/emails/sendEmail');
const { populateBatchedQuizzes } = require('../helpers');
const { redisCache, getCachedData, setCachedData } = require('../../../utils/global-helpers');

let keysToClear = []
exports.getQuizzes = async (req, res) => {

    try {
        var pageNo = parseInt(req.query.pageNo);
        const totalQuizzes = await Quiz.countDocuments({});

        // If limit & skip are defined
        let limit = parseInt(req.query.limit);
        let skip = parseInt(req.query.skip) || 0;

        // LIMITED
        if (limit) {

            const cacheKey = `limited_quizzes_${limit}_${skip}`;
            const cached = await getCachedData(cacheKey);
            if (cached) return res.status(200).json(cached);

            let limitedQuizzes = await Quiz.find({})
                .sort({ creation_date: -1 })
                .populate('category questions')
                .limit(limit)
                .skip(skip);

            if (!limitedQuizzes.length) {
                throw { 'message': 'No quizzes found!', 'status': 204 };
            }

            const expandedQuizzes = await populateBatchedQuizzes(limitedQuizzes);
            const result = {
                totalPages: Math.ceil(totalQuizzes / PAGE_SIZE),
                currentPage: pageNo,
                pageSize: PAGE_SIZE,
                totalQuizzes,
                quizzes: expandedQuizzes || limitedQuizzes,
            };

            await setCachedData(cacheKey, result) && keysToClear.push(cacheKey);
            res.status(200).json(result);
        }
        // PAGINATED
        else if (pageNo && pageNo > 0) {

            const cacheKey = `paginated_quizzes_${pageNo}`;
            const cached = await getCachedData(cacheKey);
            if (cached) return res.status(200).json(cached);

            // If limit & skip undefined: Pagination - ENFORCE pagination to prevent memory exhaustion
            var PAGE_SIZE = 20;
            var query = {};

            // Always enforce pagination - never load all quizzes
            query.limit = PAGE_SIZE;
            query.skip = PAGE_SIZE * (pageNo - 1);

            // Always use pagination to prevent memory exhaustion
            let paginatedQuizzes = await Quiz.find({}, {}, query).populate('category questions').sort({ creation_date: -1 }).lean();

            if (!paginatedQuizzes || paginatedQuizzes.length === 0) {
                throw { message: 'No quizzes found', status: 204 };
            }

            if (req.query?.filter === 'stats') {
                return res.status(200).json(totalQuizzes);
            }

            if (!paginatedQuizzes.length) {
                throw { message: 'No quizzes found!', status: 204 };
            }

            const expandedQuizzes = await populateBatchedQuizzes(paginatedQuizzes);
            const result = {
                totalPages: Math.ceil(totalQuizzes / PAGE_SIZE),
                currentPage: pageNo,
                pageSize: PAGE_SIZE,
                totalQuizzes,
                quizzes: expandedQuizzes || paginatedQuizzes,
            };
            await setCachedData(cacheKey, result) && keysToClear.push(cacheKey);
            res.status(200).json(result);

        }
        // NO LIMIT AND NO SKIP AT ALL
        else {
            const cacheKey = 'all_quizzes';
            const cached = await getCachedData(cacheKey);
            if (cached) return res.status(200).json(cached);
            let allQuizzes = await Quiz.find({})
                .sort({ creation_date: -1 })
                .populate('category questions');

            if (!allQuizzes.length) {
                throw { message: 'No quizzes found!', status: 204 };
            }

            const expandedQuizzes = await populateBatchedQuizzes(allQuizzes);
            allQuizzes = expandedQuizzes || allQuizzes;

            await setCachedData(cacheKey, allQuizzes) && keysToClear.push(cacheKey);
            res.status(200).json(allQuizzes);
        }
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneQuiz = async (req, res) => {

    try {
        const id = req.params.id;
        const query = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { slug: id };

        const quiz = await Quiz.findOne(query).populate('category questions');
        if (!quiz) throw { status: 404, message: `Quiz with id ${id} not found` };

        // Expand user data using simple direct calls
        const expandedUser = await User.findById(quiz.created_by).select('-password -__v -verified -otp -otpExpires -register_date -last_login');
        const expandedQuiz = { ...quiz, ...expandedUser };
        res.status(200).json(expandedQuiz || quiz);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getQuizzesByCategory = async (req, res) => {
    try {
        const cacheKey = `category_quizzes_${req.params.id}`;
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);

        let quizzes = await Quiz.find({ category: req.params.id })
            .populate('category questions');
        if (!quizzes.length) {
            throw { message: 'No quizzes found', status: 204 };
        }

        const expandedQuizzes = await populateBatchedQuizzes(quizzes);
        quizzes = expandedQuizzes || quizzes;

        await setCachedData(cacheKey, quizzes) && keysToClear.push(cacheKey);
        res.status(200).json(quizzes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getQuizzesByNotes = async (req, res) => {
    try {

        const cacheKey = `notes_quizzes_${req.params.id}`;
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);

        const categories = await Category.find({ category: req.params.id });
        let quizzes = await Quiz.find({ category: { $in: categories } }).populate('category questions');
        if (!quizzes.length) {
            throw { message: 'No quizzes found!', status: 204 };
        }

        const expandedQuizzes = await populateBatchedQuizzes(quizzes);
        quizzes = expandedQuizzes || quizzes;

        await setCachedData(cacheKey, quizzes) && keysToClear.push(cacheKey);
        res.status(200).json(quizzes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getBatchedQuizzes = async (req, res) => {
    try {
        const ids = req.body.quizzesIDs;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            throw { message: 'No quiz IDs provided!', status: 400 };
        }

        const quizzes = await Quiz.find({ _id: { $in: ids } })
            .populate('category questions');
        if (!quizzes.length) {
            throw { message: 'No quizzes found!', status: 204 };
        }

        res.status(200).json(quizzes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createQuiz = async (req, res) => {

    try {
        const { title, description, category, created_by } = req.body;

        if (!title || !description || !category) {
            throw { message: 'There are missing info!', status: 400 };
        }

        const existingQuiz = await Quiz.findOne({ title });
        if (existingQuiz) throw { message: 'Quiz already exists!', status: 400 };

        const newQuiz = new Quiz({ title, description, category, created_by });
        const updatedCategory = await Category.findByIdAndUpdate(category, { $addToSet: { quizes: newQuiz._id } },
            { new: true }
        );

        if (!updatedCategory) throw { message: 'Cannot update corresponding category!', status: 400 };
        const savedQuiz = await newQuiz.save();
        if (!savedQuiz) throw { message: 'Something went wrong during creation!', status: 400 };

        // Clear cache for keys
        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(savedQuiz);
    } catch (err) {
        handleError(res, err);
    }
};

exports.notifying = async (req, res) => {
    try {
        const { slug, title, category, created_by } = req.body;

        let subscribers = [];
        const { data } = await getFromService(`${process.env.USERS_SERVICE_URL}/api/subscribed-users`);
        subscribers = data;
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

exports.updateQuiz = async (req, res) => {

    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) throw { message: 'Quiz not found!', status: 404 };

        // If updating quiz
        const updatedQuiz = await Quiz.findByIdAndUpdate(req.params.id, req.body, { new: true });

        // If moving quiz from one category to another
        if (req.body?.oldCategoryID) {
            Category.updateOne(
                { _id: req.body.oldCategoryID },
                { $pull: { quizes: quiz._id } }
            )
                .then(() => {
                    Category.updateOne(
                        { _id: req.body.category },
                        { $addToSet: { 'quizes': quiz._id } }
                    );
                });
        }

        res.status(200).json(updatedQuiz);
    } catch (err) {
        handleError(res, err);
    }
};

exports.addVidLink = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) throw { message: 'Quiz not found!', status: 404 };

        quiz.video_links.push(req.body);
        await quiz.save();

        res.status(200).json(quiz);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteQuiz = async (req, res) => {
    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) throw { message: 'Quiz not found!', status: 404 };

        await Category.updateOne(
            { _id: quiz.category },
            { $pull: { quizes: quiz._id } }
        );

        await Question.deleteMany({ quiz: quiz._id });
        await Quiz.deleteOne({ _id: req.params.id });

        // Clear cache for keys
        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(quiz);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteVideo = async (req, res) => {

    try {
        const quiz = await Quiz.findById(req.params.id);
        if (!quiz) throw { message: 'Quiz not found!', status: 404 };

        quiz.video_links.id(req.body.vId).remove();
        await quiz.save();

        res.status(200).json(quiz);
    } catch (err) {
        handleError(res, err);
    }
};

// Get database statistics
exports.getDatabaseStats = async (req, res) => {
    try {
        const db = Quiz.db;

        // Get stats for quizzes collection using simpler approach
        const quizzesCollection = db.collection('quizzes');
        const quizzesCount = await quizzesCollection.countDocuments();
        const quizSample = await quizzesCollection.find({}).limit(50).toArray();
        const avgQuizSize = quizSample.length > 0 ?
            quizSample.reduce((sum, doc) => sum + JSON.stringify(doc).length, 0) / quizSample.length : 0;
        const estimatedQuizDataSize = quizzesCount * avgQuizSize;

        // Get stats for questions collection
        const questionsCollection = db.collection('questions');
        const questionsCount = await questionsCollection.countDocuments().catch(() => 0);
        const estimatedQuestionDataSize = questionsCount * 200; // Estimate

        // Get stats for categories collection
        const categoriesCollection = db.collection('categories');
        const categoriesCount = await categoriesCollection.countDocuments().catch(() => 0);
        const estimatedCategoryDataSize = categoriesCount * 100; // Estimate

        // Get aggregated quiz data
        const pipeline = [
            {
                $group: {
                    _id: null,
                    totalQuizzes: { $sum: 1 },
                    activeQuizzes: {
                        $sum: {
                            $cond: [
                                { $gte: ['$creation_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] },
                                1,
                                0
                            ]
                        }
                    },
                    avgQuestionsPerQuiz: { $avg: { $size: '$questions' } }
                }
            }
        ];

        const aggregatedStats = await quizzesCollection.aggregate(pipeline).toArray();
        const quizStats = aggregatedStats[0] || {};

        const dbStats = {
            service: 'quizzes',
            timestamp: new Date().toISOString(),
            documents: quizzesCount + questionsCount + categoriesCount,
            totalDocuments: quizzesCount + questionsCount + categoriesCount,
            dataSize: estimatedQuizDataSize + estimatedQuestionDataSize + estimatedCategoryDataSize,
            totalDataSize: estimatedQuizDataSize + estimatedQuestionDataSize + estimatedCategoryDataSize,
            storageSize: Math.round((estimatedQuizDataSize + estimatedQuestionDataSize + estimatedCategoryDataSize) * 1.2),
            totalStorageSize: Math.round((estimatedQuizDataSize + estimatedQuestionDataSize + estimatedCategoryDataSize) * 1.2),
            indexSize: Math.round((estimatedQuizDataSize + estimatedQuestionDataSize + estimatedCategoryDataSize) * 0.1),
            totalIndexSize: Math.round((estimatedQuizDataSize + estimatedQuestionDataSize + estimatedCategoryDataSize) * 0.1),
            collections: {
                quizzes: {
                    documents: quizzesCount,
                    dataSize: estimatedQuizDataSize,
                    avgDocumentSize: avgQuizSize
                },
                questions: {
                    documents: questionsCount,
                    dataSize: estimatedQuestionDataSize,
                    avgDocumentSize: 200
                },
                categories: {
                    documents: categoriesCount,
                    dataSize: estimatedCategoryDataSize,
                    avgDocumentSize: 100
                }
            },
            quizMetrics: {
                totalQuizzes: quizStats.totalQuizzes || 0,
                activeQuizzes: quizStats.activeQuizzes || 0,
                avgQuestionsPerQuiz: Math.round(quizStats.avgQuestionsPerQuiz || 0)
            }
        };

        res.status(200).json(dbStats);
    } catch (err) {
        handleError(res, err);
    }
};
