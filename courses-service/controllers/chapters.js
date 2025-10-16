const Chapter = require("../models/Chapter");
const Notes = require("../models/Notes");
const { handleError } = require('../utils/error');
const { populateUser, validateRequiredFields, findChapterById } = require('../utils/helpers');

exports.getChapters = async (req, res) => {
    try {
        const chapters = await Chapter.find().populate('course courseCategory', 'title').sort({ createdAt: -1 }).select('title description course courseCategory created_by');
        if (!chapters) return res.status(204).json({ message: 'No chapters found!' });

        // Populate created_by field for each chapter
        const populatedChapters = await Promise.all(
            chapters.map(async (chapter) => {
                let created_by = await populateUser(chapter.created_by) || chapter.created_by;
                return { ...chapter.toObject(), created_by };
            })
        ) || chapters;

        res.status(200).json(populatedChapters);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getChaptersByCourse = async (req, res) => {
    try {
        const chapters = await Chapter.find({ course: req.params.id }).populate('course courseCategory', 'title').select('title description course courseCategory created_by');

        const populatedChapters = await Promise.all(
            chapters.map(async (chapter) => {
                let created_by = await populateUser(chapter.created_by) || chapter.created_by;
                return { ...chapter.toObject(), created_by };
            })
        ) || chapters;

        res.status(200).json(populatedChapters);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneChapter = async (req, res) => {
    try {
        const course = await findChapterById(req.params.id, res, 'title description course courseCategory created_by');
        if (course) res.status(200).json(course);
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
        if (chapter) return res.status(403).json({ message: 'Chapter already exists!' });

        const newChapter = new Chapter({
            title,
            description,
            courseCategory,
            course,
            created_by
        });

        const savedChapter = await newChapter.save();
        if (!savedChapter) return res.status(503).json({ message: 'Something went wrong during creation!' });

        res.status(200).json(savedChapter);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateChapter = async (req, res) => {
    try {
        const chapter = await findChapterById(req.params.id, res);
        if (!chapter) return res.status(404).json({ message: 'Chapter not found!' });

        const updatedChapter = await Chapter.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updatedChapter);
    } catch (error) {
        handleError(res, error);
    }
};

exports.deleteChapter = async (req, res) => {
    try {
        const chapter = await findChapterById(req.params.id, res);
        if (!chapter) return res.status(404).json({ message: 'Chapter not found!' });

        // Delete notes belonging to this chapter
        await Notes.deleteMany({ chapter: chapter._id });

        // Delete this chapter
        await Chapter.deleteOne({ _id: req.params.id });
        res.status(200).json({ message: 'Chapter Deleted!' });
    } catch (err) {
        handleError(res, err);
    }
};
