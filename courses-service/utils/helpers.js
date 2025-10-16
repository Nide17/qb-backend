const axios = require('axios');
const { handleError } = require('./error');
const Course = require("../models/Course");
const CourseCategory = require("../models/CourseCategory");
const Notes = require("../models/Notes");
const Chapter = require("../models/Chapter");

// Helper function to call other services
const callService = async (url, timeout = 20000) => {

    if (!url || typeof url !== 'string' || url.startsWith('undefined')) return null;

    try {
        const response = await axios.get(url, {
            timeout: timeout, // 20 seconds default timeout for normal requests, longer for long running tasks
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (err) {
        console.warn(`\n\nService call failed for URL: ${url}\nError:`, err.name, err.message);
        return null;
    }
};

// Simple population function for users
const populateUser = async (userId) => {
    if (!userId) return null;
    const data = await callService(`${process.env.USERS_SERVICE_URL}/api/users/${userId}`);

    return data ? {
        _id: data._id,
        name: data.name
    } : { _id: userId, name: 'Unknown User' };
};

// Generalized helper function to validate required fields
const validateRequiredFields = (fields) => {
    for (const field of fields) {
        if (!field.value) {
            throw new Error(`Missing required field: ${field.name}`);
        }
    }
};

// Helper function to find course by ID
const findCourseById = async (id, res, selectFields = '') => {

    try {
        let course = await Course.findById(id).populate('courseCategory', 'title').select(selectFields);
        if (!course) return res.status(404).json({ message: 'Course not found!' });

        if (course.created_by) {
            const user = await populateUser(course.created_by);
            course = course.toObject ? course.toObject() : course;
            course.created_by = user;
        }
        return course;
    } catch (err) {
        handleError(res, err);
    }
};

// Helper function to find category by ID
const findCourseCategoryById = async (id, res, selectFields = '') => {

    try {
        const category = await CourseCategory.findById(id).select(selectFields);
        if (!category) return res.status(404).json({ message: 'No category found!' });

        if (category.created_by) {
            const user = await populateUser(category.created_by);
            const categoryObj = category.toObject ? category.toObject() : category;
            categoryObj.created_by = user;
            return categoryObj;
        }
        return category;
    } catch (err) {
        handleError(res, err);
    }
};

// Helper function to find notes by ID
const findNotesById = async (id, res, selectFields = '') => {

    try {
        const notes = await Notes.findById(id).populate('course chapter courseCategory', 'title').select(selectFields);
        if (!notes) return res.status(404).json({ message: 'Notes not found!' });

        let notesObj = notes.toObject ? notes.toObject() : notes;
        if (notes.uploaded_by) {
            const user = await populateUser(notes.uploaded_by);
            notesObj.uploaded_by = user;
        }

        return notesObj;
    } catch (err) {
        handleError(res, err);
        return null;
    }
};

// Helper function to find chapter by ID
const findChapterById = async (id, res, selectFields = '') => {

    try {
        let chapter = await Chapter.findById(id).populate('course courseCategory', 'title').select(selectFields);
        if (!chapter) return res.status(404).json({ message: 'Chapter not found!' });

        if (chapter.created_by) {
            const user = await populateUser(chapter.created_by);
            chapter = chapter.toObject ? chapter.toObject() : chapter;
            chapter.created_by = user;
        }

        return chapter;
    } catch (err) {
        handleError(res, err);
        return null;
    }
};

module.exports = { callService, populateUser, validateRequiredFields, findCourseById, findCourseCategoryById, findNotesById, findChapterById };
