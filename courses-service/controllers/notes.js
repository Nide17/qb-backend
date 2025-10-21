const Notes = require("../models/Notes");
const { handleError } = require('../utils/error');
const { populateUser, validateRequiredFields } = require('../utils/helpers');

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

exports.getOneNotes = async (req, res) => {
    try {
        const id = req.params.id;
        const query = id.match(/^[0-9a-fA-F]{24}$/) ? { _id: id } : { slug: id };
        const notes = await Notes.findOne(query).populate('course chapter courseCategory', 'title')
        if (!notes) return res.status(404).json({ message: 'Notes not found!' });

        let notesObj = notes.toObject ? notes.toObject() : notes;
        if (notes.uploaded_by) {
            const user = await populateUser(notes.uploaded_by);
            notesObj.uploaded_by = user;
        }
        res.status(200).json(notes)
    } catch (err) {
        handleError(res, err);
    }
};

exports.createNotes = async (req, res) => {

    try {

        const not_file = req.file;

        const { title, description, chapter, course, courseCategory, uploaded_by } = req.body;
        validateRequiredFields([
            { name: 'title', value: title },
            { name: 'description', value: description },
            { name: 'chapter', value: chapter },
            { name: 'course', value: course },
            { name: 'courseCategory', value: courseCategory },
            { name: 'uploaded_by', value: uploaded_by }
        ])

        const notes = await Notes.findOne({ title });
        if (notes) throw new Error('Notes with that title arleady exists!')

        const newNotes = new Notes({
            title,
            notes_file: not_file && not_file.location,
            chapter,
            course,
            courseCategory,
            uploaded_by
        });

        const savedNotes = await newNotes.save();
        if (!savedNotes) throw new Error('Could not save notes, try again!');

        res.status(200).json(savedNotes);

    } catch (err) {
        handleError(res, err);
    }
};

exports.updateNotes = async (req, res) => {
    try {
        const not_file = req.file;

        const notes = await Notes.findById(req.params.id);

        if (!notes) res.status(404).json({ message: 'Notes not found!' });
        console.log("notes: ", notes)

        let updates = { ...req.body };
        if (not_file) updates.notes_file = not_file.location;
        console.log("updates: ", updates)

        const updatedNotes = await Notes.findByIdAndUpdate(req.params.id, updates, { new: true });
        console.log("updatedNotes: ", updatedNotes)
        res.status(200).json(updatedNotes);
    } catch (err) {
        handleError(res, err);
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
            { $pull: { quizes: req.body.quizID } }
        );

        res.status(200).json({ message: `Deleted!` });
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteNotes = async (req, res) => {
    try {
        const notes = await Notes.findById(req.params.id);
        if (!notes) return res.status(404).json({ message: 'Notes not found!' });

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
            return res.status(400).json({ message: 'No quiz IDs provided!' });
        }

        const notes = await Notes.find({ _id: { $in: ids } }).populate('chapter course courseCategory', 'title');
        if (!notes.length) {
            return res.status(204).json({ message: 'No notes found!' });
        }

        res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};
