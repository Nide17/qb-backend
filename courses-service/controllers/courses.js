const Course = require('../models/Course');
const Chapter = require('../models/Chapter');
const Notes = require('../models/Notes');
const { handleError } = require('../utils/error');
const { populateUser, validateRequiredFields } = require('../utils/helpers');

exports.getCourses = async (req, res) => {
    try {
        const courses = await Course.find().populate('courseCategory', 'title').sort({ createdAt: -1 }).select('title description courseCategory created_by');
        if (!courses) throw { 'message': 'No courses found!', 'status': 204 };

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
        if (!courses) throw { 'message': 'No courses found!', 'status': 404 };

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

exports.getOneCourse = async (req, res) => {

    try {
        let course = await Course.findById(req.params.id).populate('courseCategory', 'title description courseCategory created_by');

        // Populate creator
        let created_by = await populateUser(course.created_by) || course.created_by;
        course = { ...course.toObject(), created_by };

        res.status(200).json(course);
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
        if (course) throw { 'message': 'Course with this title already exists!', 'status': 409 };

        const newCourse = new Course({
            title,
            description,
            courseCategory,
            created_by
        });

        const savedCourse = await newCourse.save();
        if (!savedCourse) throw { 'message': 'Could not save course, try again!', 'status': 500 };

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

exports.updateCourse = async (req, res) => {
    try {
        let course = await Course.findById(req.params.id);
        if (!course) throw { 'message': 'Course not found!', 'status': 404 };

        const updatedCourse = await Course.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updatedCourse);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteCourse = async (req, res) => {
    try {

        let course = await Course.findById(req.params.id);
        if (!course) throw { 'message': 'Course not found!', 'status': 404 };

        // Delete chapters and notes belonging to this course
        await Chapter.deleteMany({ course: course._id });
        await Notes.deleteMany({ course: course._id });

        // Delete this course
        await Course.deleteOne({ _id: req.params.id });
        res.status(200).json({ message: 'Deleted!' });
    } catch (err) {
        handleError(res, err);
    }
};
