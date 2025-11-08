const Course = require('../models/Course');
const Chapter = require('../models/Chapter');
const Notes = require('../models/Notes');
const { handleError } = require('../../../utils/error');
const { populateBatchedUsers } = require('../../users/helpers');
const { validateRequiredFields, redisCache, getCachedData, setCachedData } = require('../../../utils/global-helpers');

const keysToClear = new Set();
const findCourses = async (query, limit = 0) => {

    let coursesQuery = Chapter.find(query).sort({ createdAt: -1 })
        .select('title description courseCategory created_by createdAt')
        .populate('courseCategory', 'title');

    if (limit > 0) coursesQuery = coursesQuery.limit(limit);

    const courses = await coursesQuery;
    if (!courses) throw { status: 204, message: 'No courses found!' };

    // Extract unique user IDs for better efficiency
    const usersIDs = [...new Set(courses.map(c => c?.created_by?.toString()))];

    // Populate all user details: a Map
    const batchedUsers = await populateBatchedUsers(usersIDs);

    // Map courses to expanded objects
    const expandedCourses = courses.map(chapter => {
        const chapterObj = chapter.toObject();
        const created_by = batchedUsers.get(chapter?.created_by?.toString()) || chapter?.created_by;
        return { ...chapterObj, created_by };
    });

    return expandedCourses || courses;
};

exports.getCourses = async (req, res) => {
    try {
        const cacheKey = 'courses';
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);

        const courses = await findCourses({}, 0);
        await setCachedData(cacheKey, courses) && keysToClear.add(cacheKey);
        res.status(200).json(courses);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getCoursesByCategory = async (req, res) => {

    try {
        const cacheKey = `category_courses_${req.params.id}`;
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);

        const courses = await findCourses({ courseCategory: req.params.id }, 0);

        await setCachedData(cacheKey, courses) && keysToClear.add(cacheKey);
        res.status(200).json(courses);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneCourse = async (req, res) => {

    if (!req.params.id) throw { 'message': 'Course ID is required!', 'status': 400 };
    console.log("req.params.id: ", req.params.id)

    try {
        let course = await Course.findById(req.params.id).populate('courseCategory', 'title description courseCategory created_by');

        console.log("course: ", course)

        // Populate creator
        let created_by = await populateOneUser(course?.created_by) || course?.created_by;
        course = { ...course?.toObject(), created_by };

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

        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(savedCourse);
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

        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(course);
    } catch (err) {
        handleError(res, err);
    }
};
