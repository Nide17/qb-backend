const Course = require("../models/Course");
const Chapter = require("../models/Chapter");
const Notes = require("../models/Notes");
const { handleError } = require('../utils/error');
const { populateUser, validateRequiredFields, findCourseById } = require('../utils/helpers');

exports.getCourses = async (req, res) => {
    try {
        const courses = await Course.find().populate('courseCategory', 'title').sort({ createdAt: -1 }).select('title description courseCategory created_by');
        if (!courses) return res.status(404).json({ message: 'No courses found!' });

        // Populate created_by field
        const populatedCourses = await Promise.all(courses.map(async (course) => {
            let created_by = await populateUser(course.created_by) || course.created_by;
            return { ...course.toObject(), created_by };
        }));
        res.status(200).json(populatedCourses);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getCoursesByCategory = async (req, res) => {
    try {
        let courses = await Course.find({ courseCategory: req.params.id }).populate('courseCategory', 'title').select('title description courseCategory created_by');
        if (!courses) return res.status(404).json({ message: 'No courses found!' });

        // Populate created_by field
        const populatedCourses = await Promise.all(courses.map(async (course) => {
            let created_by = await populateUser(course.created_by) || course.created_by;
            return { ...course.toObject(), created_by };
        }));
        courses = populatedCourses;
        res.status(200).json(courses);
    } catch (err) {
        handleError(res, err);
    }
};

// Updated getOneCourse to use findCourseById
exports.getOneCourse = async (req, res) => {

    try {
        const course = await findCourseById(req.params.id, res, 'title description courseCategory created_by');
        if (course) res.status(200).json(course);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createCourse = async (req, res) => {

    try {
        const { title, description, courseCategory, created_by } = req.body;

        // Validation
        validateRequiredFields([
            { name: 'title', value: title },
            { name: 'description', value: description },
            { name: 'courseCategory', value: courseCategory },
            { name: 'created_by', value: created_by }
        ]);

        const course = await Course.findOne({ title });
        if (course) return res.status(400).json({ message: 'Course already exists!' });

        const newCourse = new Course({
            title,
            description,
            courseCategory,
            created_by
        });

        const savedCourse = await newCourse.save();
        if (!savedCourse) return res.status(500).json({ message: 'Could not save course, try again!' });

        res.status(200).json({
            _id: savedCourse._id,
            title: savedCourse.title,
            description: savedCourse.description,
            courseCategory: savedCourse.courseCategory,
            created_by: savedCourse.created_by,
            createdAt: savedCourse.createdAt,
        });
    } catch (err) {
        handleError(res, err);
    }
};

// Updated updateCourse to use findCourseById
exports.updateCourse = async (req, res) => {
    try {
        const course = await findCourseById(req.params.id, res, 'title description courseCategory created_by');
        if (!course) return;

        const updatedCourse = await Course.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updatedCourse);
    } catch (err) {
        handleError(res, err);
    }
};

// Updated deleteCourse to use findCourseById
exports.deleteCourse = async (req, res) => {
    try {
        const course = await findCourseById(req.params.id, res, 'title description courseCategory created_by');
        if (!course) return;

        // Delete chapters and notes belonging to this course
        await Chapter.deleteMany({ course: course._id });
        await Notes.deleteMany({ course: course._id });

        // Delete this course
        await Course.deleteOne({ _id: req.params.id });
        res.status(200).json({ message: `Deleted!` });
    } catch (err) {
        handleError(res, err);
    }
};
