const Category = require('../models/Category');
const Quiz = require('../models/Quiz');
const Question = require('../models/Question');
const { handleError } = require('../../../utils/error');
const { validateRequiredFields, populateOneCategory, populateCategories, redisCache, setCachedData, getCachedData } = require('../helpers');

exports.getCategories = async (req, res) => {
    try {

        const cacheKey = 'categories';
        const cachedCategories = await getCachedData(cacheKey);
        if (cachedCategories) {
            return res.status(200).json(cachedCategories);
        }

        let categories = await Category.find().sort({ creation_date: -1 }).select('_id title description quizes courseCategory').populate('quizes', '_id title slug');
        if (!categories) throw { 'message': 'No categories found!', 'status': 204 };

        const expandedCategories = await populateCategories(categories);
        categories = expandedCategories || categories;

        await setCachedData(cacheKey, categories);
        res.status(200).json(categories);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneCategory = async (req, res) => {
    try {
        const id = req.params.id;
        const query = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { slug: id };
        let category = await Category.findOne(query).populate('quizes', '_id title questions slug');
        if (!category) throw { 'message': 'Unexistent category!', 'status': 404 };

        category = await populateOneCategory(category);
        res.status(200).json(category);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createCategory = async (req, res) => {
    try {
        // Validate required fields
        validateRequiredFields([
            { name: 'title', value: req.body.title },
            { name: 'description', value: req.body.description }
        ]);

        // Check for duplicate title
        const existingCategory = await Category.findOne({ title: req.body.title });
        if (existingCategory) {
            throw { 'message': 'Failed! Category with that title already exists!', 'status': 400 };
        }

        const newCategory = new Category(req.body);
        let savedCategory = await newCategory.save();

        if (!savedCategory) throw { 'message': 'Something went wrong during creation!', 'status': 500 };

        savedCategory = await populateOneCategory(savedCategory);

        // Clear cache for categories
        const cacheKey = 'categories';
        await redisCache.del(cacheKey);
        res.status(200).json(savedCategory);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateCategory = async (req, res) => {
    try {
        let updatedCategory = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });

        updatedCategory = await populateOneCategory(updatedCategory);

        res.status(200).json(updatedCategory);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) throw { 'message': 'Category does not exist!', 'status': 404 };

        // Delete all quizzes associated with this category
        await Quiz.deleteMany({ category: category._id });

        // Delete all questions associated with this category
        await Question.deleteMany({ category: category._id });

        const removedCategory = await Category.deleteOne({ _id: req.params.id });
        if (removedCategory.deletedCount === 0) throw { 'message': 'Something went wrong while deleting the category!', 'status': 500 };

        // Clear cache for categories
        const cacheKey = 'categories';
        await redisCache.del(cacheKey);
        res.status(200).json(category);
    } catch (err) {
        handleError(res, err);
    }
};
