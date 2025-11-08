const CourseCategory = require('./models/CourseCategory');

const getBatchedCourseCategories = async (courseCategoriesIDs) => {

    if (!courseCategoriesIDs || courseCategoriesIDs.length === 0) return new Map();

    try {
        const courseCategories = await CourseCategory.find({ _id: { $in: courseCategoriesIDs } }).select('title');
        if (!courseCategories) throw { 'message': 'No course categories found!', 'status': 404 };

        const courseCategoriesMap = new Map();
        for (const courseCategory of courseCategories || []) {
            courseCategoriesMap.set(courseCategory._id.toString(), courseCategory);
        }
        return courseCategoriesMap;
    } catch (err) {
        return new Map();
    }
}

module.exports = {
    getBatchedCourseCategories,
};
