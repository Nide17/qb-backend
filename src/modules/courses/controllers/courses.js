const { getModels } = require('../../../utils/db-manager');
const { handleError } = require('../../../utils/error');
const { getBatchedUsersMap } = require('../../users/helpers');
const { validateRequiredFields, cacheManager, cacheWrapper } = require('../../../utils/global-helpers');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "crs:all",
    ONE: (id) => `crs:${id}`,
    BY_CC: (id) => `crs_cc:${id}`,
};

const findCourses = async (query, limit = 0) => {

    const { Course } = await getModels('courses');

    let coursesQuery = Course.find(query).sort({ createdAt: -1 })
        .select('-__v -updatedAt -last_updated_by')
        .populate('courseCategory', 'title')
        .lean();

    if (limit > 0) coursesQuery = coursesQuery.limit(limit);

    const courses = await coursesQuery;
    if (!courses) throw { 'status': 404, message: 'No courses found!' };

    // Extract unique IDs
    const usersIDs = [...new Set(courses.map(c => c?.created_by?.toString()))];

    // Get users details as a Map
    const usersMap = await getBatchedUsersMap(usersIDs);

    // Map courses to expanded objects
    const expandedCourses = courses.map(course => {
        const created_by = usersMap.get(course?.created_by?.toString()) || course?.created_by;
        return { ...course, created_by };
    });

    return expandedCourses || courses;
};

exports.getCourses = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ALL;
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await findCourses({}, 0);
        })
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneCourse = async (req, res) => {

    try {
        const cacheKey = CACHE_KEYS.ONE(req.params.id);
        const { Course } = await getModels('courses');
        const { User } = await getModels('users');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            let course = await Course
                .findById(req.params.id)
                .select('-__v -updatedAt')
                .populate('courseCategory', 'title courseCategory')
                .lean();
            if (!course) throw { 'message': 'Course not found!', 'status': 404 };
            const created_by = await User.findById(course.created_by).select('name');
            course = { ...course, created_by };
            return course;
        })
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};


exports.getCoursesByCategory = async (req, res) => {

    try {
        const cacheKey = CACHE_KEYS.BY_CC(req.params.id);
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await findCourses({ courseCategory: req.params.id }, 0);
        })
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
}

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

        const { Course } = await getModels('courses');

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

        await cacheManager.invalidatePattern("crs:*");
        res.status(201).json(savedCourse);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateCourse = async (req, res) => {
    try {
        const { Course } = await getModels('courses');

        let course = await Course.findById(req.params.id);
        if (!course) throw { 'message': 'Course not found!', 'status': 404 };

        const updatedCourse = await Course.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedCourse) throw { 'message': 'Something went wrong while updating!', 'status': 503 };

        await cacheManager.invalidatePattern("crs:*");
        res.status(200).json(updatedCourse);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteCourse = async (req, res) => {
    try {
        const { Course, Chapter, Notes } = await getModels('courses');

        let course = await Course.findById(req.params.id);
        if (!course) throw { 'message': 'Course not found!', 'status': 404 };

        // Delete chapters and notes belonging to this course
        await Chapter.deleteMany({ course: course._id });
        await Notes.deleteMany({ course: course._id });

        // Delete this course
        await Course.deleteOne({ _id: req.params.id });

        await cacheManager.invalidatePattern("crs:*");
        res.status(200).json(course);
    } catch (err) {
        handleError(res, err);
    }
};
