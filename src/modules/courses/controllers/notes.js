const Notes = require('../models/Notes');
const { handleError } = require('../../../utils/error');
const { getBatchedUsersMap } = require('../../users/helpers');
const { validateRequiredFields, cacheManager, cacheWrapper } = require('../../../utils/global-helpers');
const User = require('../../users/models/User');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "cat:all",
    ONE: (id) => `cat:${id}`,
};
const expandNotes = async (notes) => {

    if (!notes) throw { status: 404, message: 'No notes found!' };

    // Extract unique IDs
    const usersIDs = [...new Set(notes.map(n => n.uploaded_by?.toString()))];

    // Get users details as a Map
    const usersMap = await getBatchedUsersMap(usersIDs);

    // Map notes to expanded objects
    const expandedNotes = notes.map(nt => {
        const expandedNote = { ...nt };
        if (nt.uploaded_by) expandedNote.uploaded_by = usersMap.get(nt.uploaded_by.toString());
        return expandedNote;
    });

    return expandedNotes || notes;
};

const findNotes = async (query, limit = 0, key) => {

    const cacheKey = `notes_${key}`

    let notes = await Notes.find(query).sort({ createdAt: -1 })
        .select('title description notes_file chapter course courseCategory quizes uploaded_by slug createdAt')
        .populate('course chapter courseCategory', 'title')
        .limit(limit)
        .lean();

    notes = await expandNotes(notes) || notes;
    return notes;
};

exports.getNotes = async (req, res) => {

    try {
        const notes = await findNotes({}, 0, 'all');
        res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getLimitedNotes = async (req, res) => {

    try {
        const limit = parseInt(req.query.limit) || 5;
        const notes = await findNotes({}, limit, `limit_${limit}`);
        res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getNotesByCategory = async (req, res) => {
    try {
        const notes = await findNotes({ courseCategory: req.params.id }, 0, `category_${req.params.id}`);
        res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getNotesByChapter = async (req, res) => {
    try {
        const notes = await findNotes({ chapter: req.params.id }, 0, `chapter_${req.params.id}`);
        res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneNotes = async (req, res) => {
    try {

        if (!req.params.id) throw { 'message': 'Notes ID is required!', 'status': 400 };
        const query = req.params.id.match(/^[0-9a-fA-F]{24}$/) ? { _id: req.params.id } : { slug: req.params.id };

        let notes = await Notes.findOne(query).populate('course chapter courseCategory', 'title').lean();
        if (!notes) throw { 'message': 'Notes not found!', 'status': 404 };
        if (notes.uploaded_by) notes.uploaded_by = await User.findById(notes.uploaded_by).select('name');
        res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createNotes = async (req, res) => {

    try {
        const not_file = req.file;

        if (!not_file) throw { message: 'Notes file is required!', status: 400 };

        const { title, description, chapter, course, courseCategory, uploaded_by } = req.body;
        validateRequiredFields([
            { name: 'title', value: title },
            { name: 'description', value: description },
            { name: 'chapter', value: chapter },
            { name: 'course', value: course },
            { name: 'courseCategory', value: courseCategory },
            { name: 'uploaded_by', value: uploaded_by }
        ]);

        const notes = await Notes.findOne({ title });
        if (notes) throw { message: 'Notes with that title arleady exists!', status: 400 };

        const newNotes = new Notes({
            title,
            notes_file: not_file && not_file.location,
            chapter,
            course,
            courseCategory,
            uploaded_by
        });

        const savedNotes = await newNotes.save();
        if (!savedNotes) throw { message: 'Could not save notes, try again!', status: 500 };


        res.status(200).json(savedNotes);

    } catch (err) {
        handleError(res, err);
    }
};

exports.updateNotes = async (req, res) => {
    try {
        const not_file = req.file;

        const notes = await Notes.findById(req.params.id);

        if (!notes) throw { 'message': 'Notes not found!', 'status': 404 };

        let updates = { ...req.body };
        if (not_file) updates.notes_file = not_file.location;

        const updatedNotes = await Notes.findByIdAndUpdate(req.params.id, updates, { new: true });
        res.status(200).json(updatedNotes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateNotesQuizzes = async (req, res) => {
    try {
        const notes = await Notes.updateOne(
            { '_id': req.params.id },
            { $push: { 'quizzes': req.body.quizesState } },
            { new: true }
        );
        res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.removeQuizFromNotes = async (req, res) => {
    try {
        const note = await Notes.findOne({ _id: req.params.id });
        if (!note) throw { 'message': 'Notes not found!', 'status': 404 };

        await Notes.updateOne(
            { _id: note._id },
            { $pull: { quizes: req.body.quizID } }
        );

        res.status(200).json({ message: 'Deleted!' });
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteNotes = async (req, res) => {
    try {
        const notes = await Notes.findById(req.params.id);
        if (!notes) throw { 'message': 'Notes not found!', 'status': 404 };

        // Delete this notes entry
        await notes.deleteOne();


        res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};
