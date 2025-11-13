const CourseCategory = require('./models/CourseCategory');
const Notes = require('./models/Notes');

const getBatchedCourseCategoriesMap = async (courseCategoriesIDs) => {

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

getBatchedNotesMap = async (notesIDs) => {

    try {
        if (!notesIDs || !Array.isArray(notesIDs) || notesIDs.length === 0) return new Map();
        let notes = await Notes.find({ _id: { $in: notesIDs } }).populate('chapter course courseCategory', 'title');
        if (!notes.length) throw { 'message': 'No notes found!', 'status': 404 };

        const notesMap = new Map();
        for (const note of notes || []) {
            notesMap.set(note._id.toString(), note);
        }
        return notesMap;
    } catch (err) {
        return new Map();
    }
};

module.exports = {
    getBatchedCourseCategoriesMap,
    getBatchedNotesMap,
};
