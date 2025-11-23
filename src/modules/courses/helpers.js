const { getModels } = require('../../utils/db-manager');

const getBatchedCourseCategoriesMap = async (courseCategoriesIDs) => {

    if (!courseCategoriesIDs || courseCategoriesIDs.length === 0) return new Map();
    const { CourseCategory } = await getModels('courses');

    try {
        const courseCategories = await CourseCategory.find({ _id: { $in: courseCategoriesIDs } }).select('title');
        if (!courseCategories) throw { 'message': 'No course categories found!', 'status': 404 };

        const courseCategoriesMap = new Map();
        for (const courseCategory of courseCategories || []) {
            courseCategoriesMap.set(courseCategory._id.toString(), courseCategory);
        }
        return courseCategoriesMap;
    } catch (err) {
        console.log(err.name);
        return new Map();
    }
}

const getBatchedNotesMap = async (notesIDs) => {

    try {
        if (!notesIDs || !Array.isArray(notesIDs) || notesIDs.length === 0) return new Map();
        const { Notes } = await getModels('courses');

        let notes = await Notes.find({ _id: { $in: notesIDs } }).populate('chapter course courseCategory', 'title');
        if (!notes.length) throw { 'message': 'No notes found!', 'status': 404 };

        const notesMap = new Map();
        for (const note of notes || []) {
            notesMap.set(note._id.toString(), note);
        }
        return notesMap;
    } catch (err) {
        console.error(err.message);
        return new Map();
    }
};

module.exports = {
    getBatchedCourseCategoriesMap,
    getBatchedNotesMap,
};
