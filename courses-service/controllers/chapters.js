const Chapter = require('../models/Chapter');
const Notes = require('../models/Notes');
const { handleError } = require('../utils/error');
const { populateUser, validateRequiredFields } = require('../utils/helpers');

exports.getChapters = async (req, res) => {
    try {
        const chapters = await Chapter.find().populate('course courseCategory', 'title').sort({ createdAt: -1 }).select('title description course courseCategory created_by');
        if (!chapters) throw { 'message': 'No chapters found!', 'status': 204 };

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
        let chapter = await Chapter.findById(req.params.id).populate('course courseCategory', 'title description course courseCategory created_by');
        if (!chapter) throw { 'message': 'Chapter not found!', 'status': 404 };

        // Populate user
        chapter = chapter.toObject ? chapter.toObject() : chapter;
        chapter.created_by = await populateUser(chapter.created_by);
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
