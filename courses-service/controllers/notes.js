const Notes = require('../models/Notes');
const { handleError } = require('../utils/error');
const { populateUser, validateRequiredFields } = require('../utils/helpers');

// Helper function to find notes with optional limit
// NOTE: this helper returns data or throws; it MUST NOT call handleError or accept `res`.
const findNotes = async (query, limit = 0) => {
    let notesQuery = Notes.find(query).sort({ createdAt: -1 })
        .select('title description notes_file chapter course courseCategory quizes uploaded_by slug createdAt')
        .populate('course chapter courseCategory', 'title');

    if (limit > 0) notesQuery = notesQuery.limit(limit);

    const notes = await notesQuery;
    if (!notes) throw { status: 204, message: 'No notes found!' };

    // Populate user details for each note
    return await Promise.all(notes.map(async (note) => {
        if (note.uploaded_by) {
            const user = await populateUser(note.uploaded_by);
            note = note.toObject ? note.toObject() : note;
            note.uploaded_by = user;
        }
        return note;
    }));
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
        if (!notes) throw {'message':'Notes not found!','statusCode':404};

        let notesObj = notes.toObject ? notes.toObject() : notes;
        if (notes.uploaded_by) {
            const user = await populateUser(notes.uploaded_by);
            notesObj.uploaded_by = user;
        }
        res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createNotes = async (req, res) => {

    try {
        const not_file = req.file;

        if (!not_file) throw { message: 'Notes file is required!', statusCode: 400 };

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
        if (notes) throw { message: 'Notes with that title arleady exists!', statusCode: 400 };

        const newNotes = new Notes({
            title,
            notes_file: not_file && not_file.location,
            chapter,
            course,
            courseCategory,
            uploaded_by
        });

        const savedNotes = await newNotes.save();
        if (!savedNotes) throw { message: 'Could not save notes, try again!', statusCode: 500 };

        res.status(200).json(savedNotes);

    } catch (err) {
        handleError(res, err);
    }
};

exports.updateNotes = async (req, res) => {
    try {
        const not_file = req.file;

        const notes = await Notes.findById(req.params.id);

        if (!notes) throw {'message':'Notes not found!','statusCode':404};

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
        if (!note) throw {'message':'Notes not found!','statusCode':404};

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
        if (!notes) throw {'message':'Notes not found!','statusCode':404};

        // Delete this notes entry
        await notes.deleteOne();
        res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getBatchedNotes = async (req, res) => {
    try {
        const ids = req.body.noteIds;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            throw {'message':'Invalid or missing note IDs!','statusCode':400};
        }

        const notes = await Notes.find({ _id: { $in: ids } }).populate('chapter course courseCategory', 'title');
        if (!notes.length) {
            throw {'message':'No notes found!','statusCode':204};
        }

        res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};
