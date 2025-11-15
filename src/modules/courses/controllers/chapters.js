const Chapter = require('../models/Chapter');
const Notes = require('../models/Notes');
const User = require('../../users/models/User');
const { handleError } = require('../../../utils/error');
const { getBatchedUsersMap } = require('../../users/helpers');
const { validateRequiredFields, cacheManager, cacheWrapper } = require('../../../utils/global-helpers');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "cat:all",
    ONE: (id) => `cat:${id}`,
};
const findChapters = async (query, limit = 0) => {

    let chaptersQuery = Chapter
        .find(query)
        .sort({ createdAt: -1 })
        .select('title description course courseCategory created_by createdAt')
        .populate('course courseCategory', 'title')
        .lean();

    if (limit > 0) chaptersQuery = chaptersQuery.limit(limit);

    const chapters = await chaptersQuery;
    if (!chapters) throw { 'status': 404, message: 'No chapters found!' };

    // Extract unique IDs
    const usersIDs = [...new Set(chapters.map(c => c.created_by?.toString()))];
    const usersMap = await getBatchedUsersMap(usersIDs);

    // Map chapters to expanded objects
    const expandedChapters = chapters.map(c => {
        const expandedChapter = { ...c };
        if (c.created_by) {
            expandedChapter.created_by = usersMap.get(c.created_by.toString());
        }
        return expandedChapter;
    });

    return expandedChapters || chapters;
};

exports.getChapters = async (req, res) => {
    try {
        const cacheKey = 'chapters';
        const chapters = await findChapters({}, 0);

        res.status(200).json(chapters);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getChaptersByCourse = async (req, res) => {

    try {
        const cacheKey = `course_chapters_${req.params.id}`;

        const notes = await findChapters({ course: req.params.id }, 0);

        res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneChapter = async (req, res) => {
    try {
        let chapter = await Chapter.findById(req.params.id).populate('course courseCategory', 'title description course courseCategory created_by').lean();
        if (!chapter) throw { 'message': 'Chapter not found!', 'status': 404 };

        if (chapter.created_by) {
            chapter.created_by = await User.findById(chapter.created_by).select('name email');
        }
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
        res.status(200).json(chapter);
    } catch (err) {
        handleError(res, err);
    }
};
