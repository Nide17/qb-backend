const { handleError } = require('../../../utils/error');
const { expandComments } = require('../helpers');
const { getModels } = require('../../../utils/db-manager');
const { validateRequiredFields, cacheManager, cacheWrapper } = require('../../../utils/global-helpers');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "qzcmt:all",
    ONE: (id) => `qzcmt:${id}`,
    BY_QUIZ: (quizId) => `qzcmt:quiz:${quizId}`
};

exports.getQuizzesComments = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ALL;
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

            const { QuizComment } = await getModels('comments');

            let quizComments = await QuizComment.find().sort({ createdAt: -1 }).lean();
            const expandedComments = await expandComments(quizComments);
            quizComments = expandedComments ? expandedComments : quizComments;

            return quizComments;
        });

        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneQuizComment = async (req, res) => {

    try {

        const cacheKey = CACHE_KEYS.ONE(req.params.id);
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

            const { User } = await getModels('users');
            const { Quiz } = await getModels('quizzing');
            const { QuizComment } = await getModels('comments');

            let quizComment = await QuizComment.findById(req.params.id).lean();
            if (!quizComment) throw { 'message': 'QuizComment not found!', 'status': 404 };

            if (quizComment?.sender) {
                const sender = await User.findById(quizComment.sender).select('name');
                quizComment = { ...quizComment, sender };
            }
            if (quizComment?.quiz) {
                const quiz = await Quiz.findById(quizComment.quiz).select('title');
                quizComment = { ...quizComment, quiz };
            }

            return quizComment;
        });

        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getCommentsByQuiz = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.BY_QUIZ(req.params.id);
        const { QuizComment } = await getModels('comments');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

            let quizComments = await QuizComment.find({ quiz: req.params.id }).sort({ createdAt: -1 }).lean();
            const expandedComments = await expandComments(quizComments);
            quizComments = expandedComments ? expandedComments : quizComments;
            return quizComments;
        });

        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createQuizComment = async (req, res) => {

    const { comment, quiz, sender } = req.body;

    try {
        // Validation 
        validateRequiredFields([{ name: 'comment', value: comment }, { name: 'quiz', value: quiz }, { name: 'sender', value: sender }]);
        const { QuizComment } = await getModels('comments');

        // Create new QuizComment
        const newQuizComment = new QuizComment({ comment, quiz, sender });
        const savedQuizComment = await newQuizComment.save();
        if (!savedQuizComment) throw { message: 'Something went wrong while creating.', status: 500 };

        await cacheManager.invalidatePattern("qzcmt:*");
        res.status(201).json(savedQuizComment);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateQuizComment = async (req, res) => {
    try {
        const { QuizComment } = await getModels('comments');

        const quizComment = await QuizComment.findById(req.params.id);
        if (!quizComment) throw { message: 'QuizComment not found!', status: 404 };

        const updatedQuizComment = await QuizComment.findByIdAndUpdate(req.params.id, req.body, { new: true });

        await cacheManager.invalidatePattern("qzcmt:*");
        res.status(200).json(updatedQuizComment);
    } catch (err) {
        handleError(res, err);
    }
};

exports.approveRejectComment = async (req, res) => {

    let commentID = req.params.id;

    try {
        const { QuizComment } = await getModels('comments');

        const quizComment = await QuizComment.findById(commentID);
        if (!quizComment) throw { message: 'QuizComment not found!', status: 404 };

        const updatedQuizComment = await QuizComment.findByIdAndUpdate(commentID, { status: req.body.status }, { new: true });

        await cacheManager.invalidatePattern("qzcmt:*");
        res.status(200).json(updatedQuizComment);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteQuizComment = async (req, res) => {
    try {
        const { QuizComment } = await getModels('comments');

        const quizComment = await QuizComment.findById(req.params.id);
        if (!quizComment) throw { message: 'QuizComment not found!', status: 404 };

        const removedQuizComment = await QuizComment.deleteOne({ _id: req.params.id });
        if (removedQuizComment.deletedCount === 0) throw { message: 'Something went wrong while deleting!', status: 500 };

        await cacheManager.invalidatePattern("qzcmt:*");
        res.status(200).json(quizComment);
    } catch (err) {
        handleError(res, err);
    }
};
