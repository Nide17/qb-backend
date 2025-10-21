const Category = require("../models/Category");
const Quiz = require("../models/Quiz");
const Question = require("../models/Question");
const { handleError } = require('../utils/error');
const { validateRequiredFields, populateCategory } = require('../utils/helpers');

exports.getCategories = async (req, res) => {
    try {
        let categories = await Category.find().sort({ creation_date: -1 }).populate('quizes', '_id title questions slug');
        if (!categories) return res.status(204).json({ message: 'No categories found!' });

        for (let i = 0; i < categories.length; i++) {
            categories[i] = await populateCategory(categories[i]);
        }
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
        if (!category) throw new Error('Unexistent category!');

        category = await populateCategory(category);
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
            return res.status(400).json({ message: 'Failed! Category with that title already exists!' });
        }

        const newCategory = new Category(req.body);
        let savedCategory = await newCategory.save();

        if (!savedCategory) throw new Error('Something went wrong during creation!');

        savedCategory = await populateCategory(savedCategory);
        res.status(200).json(savedCategory);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateCategory = async (req, res) => {
    try {
        let updatedCategory = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });

        updatedCategory = await populateCategory(updatedCategory);

        res.status(200).json(updatedCategory);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) throw new Error('Category does not exist!');

        // Delete all quizzes associated with this category
        await Quiz.deleteMany({ category: category._id });

        // Delete all questions associated with this category
        await Question.deleteMany({ category: category._id });

        const removedCategory = await Category.deleteOne({ _id: req.params.id });
        if (removedCategory.deletedCount === 0) throw new Error('Something went wrong while deleting!');

        res.status(200).json(category);
    } catch (err) {
        handleError(res, err);
    }
};
