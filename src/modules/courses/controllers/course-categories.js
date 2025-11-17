const CourseCategory = require('../models/CourseCategory');
const Course = require('../models/Course');
const Chapter = require('../models/Chapter');
const Notes = require('../models/Notes');
const { handleError } = require('../../../utils/error');
const { validateRequiredFields, cacheManager, cacheWrapper } = require('../../../utils/global-helpers');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "cc:all",
    ONE: (id) => `cc:${id}`,
};
exports.getCourseCategories = async (req, res) => {

    try {
        const cacheKey = CACHE_KEYS.ALL;
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const courseCategories = await CourseCategory.find().sort({ createdAt: -1 }).select('title created_by');
            if (!courseCategories) throw { 'message': 'No course categories found!', 'status': 404 };
            return courseCategories;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneCategory = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ONE(req.params.id);
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const category = await CourseCategory.findById(req.params.id).select('title description created_by');
            if (!category) throw { 'message': 'Category not found!', 'status': 404 };
            return category;
        })
        res.status(200).json(data);
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
        if (category) throw { 'message': 'Category with this title already exists!', 'status': 409 };

        const newCategory = new CourseCategory({ title, description, created_by });
        const savedCategory = await newCategory.save();
        if (!savedCategory) throw { 'message': 'Something went wrong during creation!', 'status': 503 };

        await cacheManager.invalidatePattern("cc:*");
        res.status(200).json(savedCategory);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateCategory = async (req, res) => {
    try {
        const category = await CourseCategory.findById(req.params.id);
        if (!category) throw { 'message': 'Category not found!', 'status': 404 };

        const updatedCategory = await CourseCategory.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedCategory) throw { 'message': 'Something went wrong while updating!', 'status': 503 };

        await cacheManager.invalidatePattern("cc:*");
        res.status(200).json(updatedCategory);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteCategory = async (req, res) => {
    try {
        const category = await CourseCategory.findById(req.params.id);
        if (!category) throw { 'message': 'Category not found!', 'status': 404 };

        // Delete related data
        await Promise.all([
            Course.deleteMany({ category: category._id }),
            Chapter.deleteMany({ category: category._id }),
            Notes.deleteMany({ category: category._id })
        ]);

        const removedCategory = await CourseCategory.deleteOne({ _id: req.params.id });
        if (removedCategory.deletedCount === 0) throw { 'message': 'Something went wrong while deleting!', 'status': 503 };

        await cacheManager.invalidatePattern("cc:*");
        res.status(200).json(category);
    } catch (err) {
        handleError(res, err);
    }
};
