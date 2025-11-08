const Chapter = require('../models/Chapter');
const Notes = require('../models/Notes');
const { handleError } = require('../utils/error');
const { populateOneUser, populateBatchedUsers, validateRequiredFields } = require('../utils/helpers');

const findChapters = async (query, limit = 0) => {

    let chaptersQuery = Chapter.find(query).sort({ createdAt: -1 })
        .select('title description course courseCategory created_by createdAt')
        .populate('course courseCategory', 'title');

    if (limit > 0) chaptersQuery = chaptersQuery.limit(limit);

    const chapters = await chaptersQuery;
    if (!chapters) throw { status: 204, message: 'No chapters found!' };

    // Extract unique user IDs for better efficiency
    const usersIDs = [...new Set(chapters.map(c => c.created_by?.toString()))];

    // Populate all user details: a Map
    const batchedUsers = await populateBatchedUsers(usersIDs);

    // Map chapters to expanded objects
    const expandedChapters = chapters.map(chapter => {
        const chapterObj = chapter.toObject();
        const created_by = batchedUsers.get(chapter.created_by?.toString()) || chapter.created_by;
        return { ...chapterObj, created_by };
    });

    return expandedChapters || chapters;
};

exports.getChapters = async (req, res) => {
    try {
        const chapters = await findChapters({}, 0);
        res.status(200).json(chapters);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getChaptersByCourse = async (req, res) => {

    try {
        const notes = await findChapters({ course: req.params.id }, 0);
        res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneChapter = async (req, res) => {
    try {
        let chapter = await Chapter.findById(req.params.id).populate('course courseCategory', 'title description course courseCategory created_by');
        if (!chapter) throw { 'message': 'Chapter not found!', 'status': 404 };

        // Populate user
        chapter = chapter.toObject ? chapter.toObject() : chapter;
        chapter.created_by = await populateOneUser(chapter.created_by);
        res.status(200).json(chapter);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createChapter = async (req, res) => {

    try {
        const { title, description, courseCategory, course, created_by } = req.body;

        // Validation
        validateRequiredFields([
            { name: 'title', value: title },
            { name: 'description', value: description },
            { name: 'courseCategory', value: courseCategory },
            { name: 'course', value: course },
            { name: 'created_by', value: created_by }
        ]);

        // Check for duplicate title
        const chapter = await Chapter.findOne({ title });
        if (chapter) throw { 'message': 'Chapter with this title already exists!', 'status': 409 };

        const newChapter = new Chapter({
            title,
            description,
            courseCategory,
            course,
            created_by
        });

        const savedChapter = await newChapter.save();
        if (!savedChapter) throw { 'message': 'Something went wrong during creation!', 'status': 503 };

        res.status(200).json(savedChapter);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateChapter = async (req, res) => {
    try {
        const updatedChapter = await Chapter.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updatedChapter);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteChapter = async (req, res) => {
    try {
        let chapter = await Chapter.findById(req.params.id);
        if (!chapter) throw { 'message': 'Chapter not found!', 'status': 404 };

        // Delete notes belonging to this chapter
        await Notes.deleteMany({ chapter: chapter._id });

        // Delete this chapter
        await Chapter.deleteOne({ _id: req.params.id });
        res.status(200).json({ message: 'Chapter Deleted!' });
    } catch (err) {
        handleError(res, err);
    }
};
