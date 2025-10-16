const CourseCategory = require("../models/CourseCategory");
const Course = require("../models/Course");
const Chapter = require("../models/Chapter");
const Notes = require("../models/Notes");
const { handleError } = require('../utils/error');
const { validateRequiredFields, findCourseCategoryById } = require('../utils/helpers');

exports.getCategories = async (req, res) => {

    try {
        const courseCategories = await CourseCategory.find().sort({ createdAt: -1 }).select('title created_by');
        if (!courseCategories) return res.status(204).json({ message: 'No course categories found!' });
        res.status(200).json(courseCategories);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneCategory = async (req, res) => {
    try {
        const category = await findCourseCategoryById(req.params.id);

        if (!category) return res.status(404).json({ message: 'Category not found!' });
        res.status(200).json(category);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createCategory = async (req, res) => {
    const { title, description, created_by } = req.body;

    try {
        // Validation
        validateRequiredFields([
            { name: 'title', value: title },
            { name: 'description', value: description },
            { name: 'created_by', value: created_by }
        ]);

        const category = await CourseCategory.findOne({ title });
        if (category) return res.status(403).json({ message: 'Category already exists!' });

        const newCategory = new CourseCategory({ title, description, created_by });
        const savedCategory = await newCategory.save();
        if (!savedCategory) return res.status(503).json({ message: 'Something went wrong during creation!' });

        res.status(200).json(savedCategory);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateCategory = async (req, res) => {
    try {
        const category = await findCourseCategoryById(req.params.id);
        if (!category) return;

        const updatedCategory = await CourseCategory.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updatedCategory);
    } catch (error) {
        handleError(res, error);
    }
};

exports.deleteCategory = async (req, res) => {
    try {
        const category = await findCourseCategoryById(req.params.id);
        if (!category) return;

        // Delete related data
        await Promise.all([
            Course.deleteMany({ category: category._id }),
            Chapter.deleteMany({ category: category._id }),
            Notes.deleteMany({ category: category._id })
        ]);

        const removedCategory = await CourseCategory.deleteOne();
        if (!removedCategory) return res.status(503).json({ message: 'Something went wrong while deleting!' });

        res.status(200).json(category);
    } catch (err) {
        handleError(res, err);
    }
};
