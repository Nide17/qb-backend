const Notes = require('../models/Notes');
const { handleError } = require('../utils/error');
const { populateOneUser, populateBatchedUsers, validateRequiredFields } = require('../utils/helpers');

const findNotes = async (query, limit = 0) => {

    let notesQuery = Notes.find(query).sort({ createdAt: -1 })
        .select('title description notes_file chapter course courseCategory quizes uploaded_by slug createdAt')
        .populate('course chapter courseCategory', 'title');

    if (limit > 0) notesQuery = notesQuery.limit(limit);

    const notes = await notesQuery;
    if (!notes) throw { status: 204, message: 'No notes found!' };

    // Extract unique user IDs for better efficiency
    const userIDs = [...new Set(notes.map(n => n.viewer?.toString()))];

    // Populate all user details: a Map
    const batchedUsers = await populateBatchedUsers(userIDs);

    // Map notes to expanded objects
    const expandedNotes = notes.map(notes => {
        const notesObj = notes.toObject();
        const viewer = batchedUsers.get(notes.viewer?.toString()) || notes.viewer;
        return { ...notesObj, viewer };
    });

    return expandedNotes || notes;
};

exports.getNotes = async (req, res) => {

    try {
        const notes = await findNotes({}, 0);
        res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getLimitedNotes = async (req, res) => {

    try {
        const limit = parseInt(req.query.limit) || 5;
        const notes = await findNotes({}, limit);
        res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getNotesByCategory = async (req, res) => {
    try {
        const notes = await findNotes({ courseCategory: req.params.id });
        res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getNotesByChapter = async (req, res) => {
    try {
        const notes = await findNotes({ chapter: req.params.id });
        res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneNotes = async (req, res) => {
    try {
        const id = req.params.id;
        const query = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { slug: id };
        const notes = await Notes.findOne(query).populate('course chapter courseCategory', 'title');
        if (!notes) throw { 'message': 'Notes not found!', 'status': 404 };

        let notesObj = notes.toObject ? notes.toObject() : notes;
        if (notes.uploaded_by) {
            const user = await populateOneUser(notes.uploaded_by);
            notesObj.uploaded_by = user;
        }

        notes = notesObj ? notesObj : notes;
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

exports.getBatchedNotes = async (req, res) => {

    try {
        const ids = req.body.notesIDs;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            throw { 'message': 'Invalid or missing note IDs!', 'status': 400 };
        }

        const notes = await Notes.find({ _id: { $in: ids } }).populate('chapter course courseCategory', 'title');
        if (!notes.length) {
            throw { 'message': 'No notes found!', 'status': 204 };
        }

        res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};
