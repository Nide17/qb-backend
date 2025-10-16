const Notes = require("../models/Notes");
const { handleError } = require('../utils/error');
const { findNotesById, populateUser, validateRequiredFields } = require('../utils/helpers');

// Helper function to find notes with optional limit
const findNotes = async (query, res, limit = 0) => {
    try {
        let notesQuery = Notes.find(query).sort({ createdAt: -1 })
            .select('title description notes_file chapter course courseCategory quizzes uploaded_by slug createdAt')
            .populate('course chapter courseCategory', 'title');

        if (limit > 0) notesQuery = notesQuery.limit(limit);

        let notes = await notesQuery;
        if (!notes) return res.status(204).json({ message: 'No notes found!' });

        // Populate user details for each note
        notes = await Promise.all(notes.map(async (note) => {
            if (note.uploaded_by) {
                const user = await populateUser(note.uploaded_by);
                note = note.toObject ? note.toObject() : note;
                note.uploaded_by = user;
            }
            return note;
        }));

        return notes;
    } catch (err) {
        handleError(res, err);
    }
};

exports.getNotes = async (req, res) => {

    try {
        const notes = await findNotes({}, res);
        if (notes) res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getLimitedNotes = async (req, res) => {

    try {
        const limit = parseInt(req.query.limit) || 5;
        const notes = await findNotes({}, res, limit);
        if (notes) res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getNotesByCategory = async (req, res) => {
    try {
        const notes = await findNotes({ courseCategory: req.params.id }, res);
        if (notes) res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getNotesByChapter = async (req, res) => {
    try {
        const notes = await findNotes({ chapter: req.params.id }, res);
        if (notes) res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};

// Updated getOneNotes to use findNotesById
exports.getOneNotes = async (req, res) => {
    try {
        const notes = await findNotesById(req.params.id, res, 'title description notes_file chapter course courseCategory quizzes slug uploaded_by');
        res.status(200).json(notes)
    } catch (err) {
        handleError(res, err);
    }
};

exports.createNotes = async (req, res) => {
    const { title, description } = req.body;

    if (req.file) {
        const not_file = req.file;
        try {
            const note = await Notes.findOne({ _id: req.params.id });
            if (!note) return res.status(404).json({ message: 'Note not found' });

            const params = {
                Bucket: process.env.S3_BUCKET || config.get('S3Bucket'),
                Key: note.notes_file.split('/').pop()
            };

            s3Config.deleteObject(params, (err, data) => {
                if (err) {
                    console.log(err, err.stack);
                } else {
                    console.log(params.Key + ' notes deleted!');
                }
            });

            const updatedNotes = await Notes.findByIdAndUpdate(
                { _id: req.params.id },
                { title, description, notes_file: not_file.location },
                { new: true }
            );

            res.status(200).json(updatedNotes);
        } catch (err) {
            handleError(res, err);
        }
    } else {
        try {
            const notes = await Notes.findByIdAndUpdate({ _id: req.params.id }, req.body, { new: true });
            res.status(200).json(notes);
        } catch (err) {
            handleError(res, err);
        }
    }
};

// Updated updateNotes to use findNotesById
exports.updateNotes = async (req, res) => {
    try {
        const notes = await findNotesById(req.params.id, res);
        if (!notes) return;

        const updatedNotes = await Notes.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updatedNotes);
    } catch (error) {
        handleError(res, error);
    }
};

exports.updateNotesQuizzes = async (req, res) => {
    try {
        const notes = await Notes.updateOne(
            { "_id": req.params.id },
            { $push: { "quizzes": req.body.quizesState } },
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
        if (!note) return res.status(404).json({ message: 'Notes not found!' });

        await Notes.updateOne(
            { _id: note._id },
            { $pull: { quizzes: req.body.quizID } }
        );

        res.status(200).json({ message: `Deleted!` });
    } catch (err) {
        handleError(res, err);
    }
};

// Updated deleteNotes to use findNotesById
exports.deleteNotes = async (req, res) => {
    try {
        const notes = await findNotesById(req.params.id, res);
        if (!notes) return;

        // Delete associated quizzes
        await Notes.updateOne(
            { _id: notes._id },
            { $pull: { quizzes: { $exists: true } } }
        );

        // Delete this notes entry
        await Notes.deleteOne({ _id: req.params.id });
        res.status(200).json({ message: `Deleted!` });
    } catch (err) {
        handleError(res, err);
    }
};
