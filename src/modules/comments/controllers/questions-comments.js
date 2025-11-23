const { getModels } = require('../../../utils/db-manager');
const { handleError } = require('../../../utils/error');
const { expandComments } = require('../helpers');
const { cacheManager, cacheWrapper } = require('../../../utils/global-helpers');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "qncmt:all",
    ONE: (id) => `qncmt:${id}`,
    PAGINATED: (pageNo) => `qncmt:paginated:${pageNo}`,
    PENDING: "qncmt:pending",
    BY_QUESTION: (questionId) => `qncmt:question:${questionId}`,
    BY_QUIZ: (quizId) => `qncmt:quiz:${quizId}`
};

exports.getQuestionsComments = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ALL;
        const { QuestionComment } = await getModels('comments');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

            let questionComments = await QuestionComment.find().sort({ createdAt: -1 }).lean();
            const expandedComments = await expandComments(questionComments);
            questionComments = expandedComments ? expandedComments : questionComments;

            return questionComments;
        });

        return res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getPaginatedComments = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;

        const cacheKey = CACHE_KEYS.PAGINATED(page);
        const { QuestionComment } = await getModels('comments');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

            const paginatedQuestionsComments = await QuestionComment.find()
                .limit(limit * 1)
                .skip((page - 1) * limit)
                .sort({ createdAt: -1 })
                .lean();

            const count = await QuestionComment.countDocuments();
            const expandedComments = await expandComments(paginatedQuestionsComments)

            const result = {
                paginatedQuestionsComments: expandedComments,
                totalPages: Math.ceil(count / limit),
                currentPage: page
            };
            return result;
        });

        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getPendingComments = async (req, res) => {
    try {

        const cacheKey = CACHE_KEYS.PENDING;
        const { QuestionComment } = await getModels('comments');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

            const questionComments = await QuestionComment.find({ status: 'Pending' }).sort({ createdAt: -1 }).lean();
            const expandedComments = await expandComments(questionComments);

            return expandedComments || questionComments;
        });

        res.status(200).json(data);

    } catch (err) {
        handleError(res, err);
    }
};

exports.getCommentsByQuestion = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.BY_QUESTION(req.params.id);
        const { QuestionComment } = await getModels('comments');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

            const questionComments = await QuestionComment.find({ question: req.params.id }).sort({ createdAt: -1 }).lean();
            const expandedComments = await expandComments(questionComments);

            return expandedComments || questionComments;
        });

        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneQuestionComment = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ONE(req.params.id);

        const { QuestionComment } = await getModels('comments');
        const { User } = await getModels('users');
        const { Question } = await getModels('quizzing');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

            let questionComment = await QuestionComment.findById(req.params.id).select('comment sender question quiz status createdAt updatedAt').lean();
            if (!questionComment) throw { 'message': 'QuestionComment not found!', 'status': 404 };

            if (questionComment?.sender) {
                const user = await User.findById(questionComment?.user).select('name');
                questionComment = { ...questionComment, user: user };
            }

            if (questionComment?.question) {
                const question = await Question.findById(questionComment?.question).select('question quiz');
                questionComment = { ...questionComment, question: question, quiz: question?.quiz };
            }
            return questionComment;
        });

        res.status(200).json(data);

    } catch (err) {
        handleError(res, err);
    }
};

exports.getCommentsByQuiz = async (req, res) => {
    try {
        const { QuestionComment } = await getModels('comments');

        const cacheKey = CACHE_KEYS.BY_QUIZ(req.params.id);
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

            const questionComments = await QuestionComment.find({ quiz: req.params.id }).sort({ createdAt: -1 }).lean();
            const expandedComments = await expandComments(questionComments);
            return expandedComments || questionComments;
        });

        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createQuestionComment = async (req, res) => {
    const { comment, sender, question, quiz } = req.body;

    // Simple validation
    if (!comment || !sender || !quiz || !question) {
        throw { 'message': 'There are empty fields', 'status': 400 };
    }

    try {
        const { QuestionComment } = await getModels('comments');

        const newQuestionComment = new QuestionComment({
            comment,
            sender,
            question,
            quiz
        });

        const savedQuestionComment = await newQuestionComment.save();
        if (!savedQuestionComment) throw { 'message': 'Something went wrong during creation!', 'status': 500 };

        await cacheManager.invalidatePattern("qncmt:*");
        res.status(200).json(savedQuestionComment);
    } catch (err) {
        handleError(res, err);
    }
};

exports.approveRejectComment = async (req, res) => {

    let commentID = req.params.id;

    try {
        const { QuestionComment } = await getModels('comments');

        const questionComment = await QuestionComment.findById(commentID);
        if (!questionComment) handleError(res, { status: 404, message: 'QuestionComment not found!' });

        const updatedQuestionComment = await QuestionComment.findByIdAndUpdate(commentID, { status: req.body.status }, { new: true });
        await cacheManager.invalidatePattern("qncmt:*");
        res.status(200).json(updatedQuestionComment);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateQuestionComment = async (req, res) => {
    try {
        const { QuestionComment } = await getModels('comments');

        const questionComment = await QuestionComment.findById(req.params.id);
        if (!questionComment) handleError(res, { status: 404, message: 'QuestionComment not found!' });

        const updatedQuestionComment = await QuestionComment.findByIdAndUpdate(req.params.id, req.body, { new: true });
        await cacheManager.invalidatePattern("qncmt:*");
        res.status(200).json(updatedQuestionComment);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteQuestionComment = async (req, res) => {
    try {
        const { QuestionComment } = await getModels('comments');

        const questionComment = await QuestionComment.findById(req.params.id);
        if (!questionComment) handleError(res, { status: 404, message: 'QuestionComment not found!' });

        const removedQuestionComment = await QuestionComment.deleteOne({ _id: req.params.id });
        if (removedQuestionComment.deletedCount === 0) handleError(res, { status: 500, message: 'Something went wrong while deleting!' });

        await cacheManager.invalidatePattern("qncmt:*");
        res.status(200).json(questionComment);
    } catch (err) {
        handleError(res, err);
    }
};
