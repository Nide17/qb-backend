const CategoryModel = require('../models/Category');
const QuizModel = require('../models/Quiz');
const QuestionModel = require('../models/Question');

const { handleError } = require('../../../utils/error');
const { expandCategories, expandCategory } = require('../helpers');
const { validateRequiredFields, cacheManager, cacheWrapper } = require('../../../utils/global-helpers');

const CACHE_TTL = 3600; // 1 hour
const CACHE_KEYS = {
    ALL: "cat:all",
    ONE: (id) => `cat:${id}`,
};

// ---------------------------------------------------------------------------
// GET ALL CATEGORIES
// ---------------------------------------------------------------------------
exports.getCategories = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ALL;
        const Category = await CategoryModel();

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            let categories = await Category.find()
                .sort({ creation_date: -1 })
                .select('_id title description quizes courseCategory')
                .populate('quizes', '_id title slug')
                .lean();

            if (!categories || !categories.length)
                throw { status: 404, message: "No categories found" };

            return await expandCategories(categories);
        });

        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

// ---------------------------------------------------------------------------
// GET ONE CATEGORY (slug or ID)
// ---------------------------------------------------------------------------
exports.getOneCategory = async (req, res) => {
    try {
        const id = req.params.id;
        const query = /^[0-9a-fA-F]{24}$/.test(id)
            ? { _id: id }
            : { slug: id };

        const cacheKey = CACHE_KEYS.ONE(id);
        const Category = await CategoryModel();

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            let category = await Category.findOne(query)
                .populate('quizes', '_id title questions slug')
                .lean();

            if (!category)
                throw { status: 404, message: "Category not found" };

            return await expandCategory(category);
        });

        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

// ---------------------------------------------------------------------------
// CREATE CATEGORY
// ---------------------------------------------------------------------------
exports.createCategory = async (req, res) => {
    try {
        validateRequiredFields([
            { name: 'title', value: req.body.title },
            { name: 'description', value: req.body.description }
        ]);
        const Category = await CategoryModel();

        const exists = await Category.findOne({ title: req.body.title });
        if (exists)
            throw { status: 400, message: "Category with that title already exists" };

        const saved = await new Category(req.body).save();
        const expanded = await expandCategory(saved.toObject());
        await cacheManager.invalidatePattern("cat:*");
        res.status(200).json(expanded);

    } catch (err) {
        handleError(res, err);
    }
};

// ---------------------------------------------------------------------------
// UPDATE CATEGORY
// ---------------------------------------------------------------------------
exports.updateCategory = async (req, res) => {
    try {
        const Category = await CategoryModel();
        const updated = await Category.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        ).lean();

        if (!updated)
            throw { status: 404, message: "Category not found" };

        await cacheManager.invalidatePattern("cat:*");
        const expanded = await expandCategory(updated);
        res.status(200).json(expanded);

    } catch (err) {
        handleError(res, err);
    }
};

// ---------------------------------------------------------------------------
// DELETE CATEGORY
// ---------------------------------------------------------------------------
exports.deleteCategory = async (req, res) => {
    try {
        const Category = await CategoryModel();
        const Quiz = await QuizModel();
        const Question = await QuestionModel();

        const category = await Category.findById(req.params.id).lean();
        if (!category)
            throw { status: 404, message: "Category not found" };

        // Remove dependent quizzes and questions
        await Quiz.deleteMany({ category: category._id });
        await Question.deleteMany({ category: category._id });
        await Category.findByIdAndDelete(req.params.id);
        await cacheManager.invalidatePattern("cat:*");

        res.status(200).json(category);

    } catch (err) {
        handleError(res, err);
    }
};
