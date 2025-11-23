const { getModels } = require('../../../utils/db-manager');
const { handleError } = require('../../../utils/error');
const { getBatchedUsersMap } = require('../../users/helpers');
const { validateRequiredFields, cacheManager, cacheWrapper } = require('../../../utils/global-helpers');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "nt:all",
    ONE: (id) => `nt:${id}`,
    BY_CC: (id) => `nt:byCc:${id}`,
    BY_COURSE: (id) => `nt:byCourse:${id}`,
    BY_CHAPTER: (id) => `nt:byChapter:${id}`,
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

const findNotes = async (query, limit = 0) => {

    // Initialize all models before any populate operations
    const { Notes } = await getModels('courses');

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
        const cacheKey = CACHE_KEYS.ALL;
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await findNotes({}, 0);
        })
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getLimitedNotes = async (req, res) => {

    try {
        const limit = parseInt(req.query.limit) || 5;
        const data = await cacheWrapper.wrap(`limit_${limit}`, CACHE_TTL, async () => {
            return await findNotes({}, limit);
        })
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getNotesByCategory = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.BY_CC(req.params.id);
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await findNotes({ courseCategory: req.params.id }, 0);
        })
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};
exports.getNotesByChapter = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.BY_CHAPTER(req.params.id);
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await findNotes({ chapter: req.params.id }, 0);
        })
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneNotes = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ONE(req.params.id);

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

            const { Notes } = await getModels('courses');
            const { User } = await getModels('users');

            const query = req.params.id.match(/^[0-9a-fA-F]{24}$/) ? { _id: req.params.id } : { slug: req.params.id };

            let notes = await Notes.findOne(query).populate('course chapter courseCategory', 'title').lean();
            if (!notes) throw { 'message': 'Notes not found!', 'status': 404 };
            if (notes.uploaded_by) notes.uploaded_by = await User.findById(notes.uploaded_by).select('name');
            return notes;
        })
        res.status(200).json(data);
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

        const { Notes } = await getModels('courses');

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

        await cacheManager.invalidatePattern("nt:*");
        res.status(200).json(savedNotes);

    } catch (err) {
        handleError(res, err);
    }
};

exports.updateNotes = async (req, res) => {
    try {
        const not_file = req.file;
        const { Notes } = await getModels('courses');

        const notes = await Notes.findById(req.params.id);
        if (!notes) throw { 'message': 'Notes not found!', 'status': 404 };

        let updates = { ...req.body };
        if (not_file) updates.notes_file = not_file.location;

        const updatedNotes = await Notes.findByIdAndUpdate(req.params.id, updates, { new: true });
        await cacheManager.invalidatePattern("nt:*");
        res.status(200).json(updatedNotes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateNotesQuizzes = async (req, res) => {
    try {
        const { Notes } = await getModels('courses');

        const notes = await Notes.updateOne(
            { '_id': req.params.id },
            { $push: { 'quizzes': req.body.quizesState } },
            { new: true }
        );
        await cacheManager.invalidatePattern("nt:*");
        res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};

exports.removeQuizFromNotes = async (req, res) => {
    try {
        const { Notes } = await getModels('courses');

        const note = await Notes.findOne({ _id: req.params.id });
        if (!note) throw { 'message': 'Notes not found!', 'status': 404 };

        await Notes.updateOne(
            { _id: note._id },
            { $pull: { quizes: req.body.quizID } }
        );
        await cacheManager.invalidatePattern("nt:*");
        res.status(200).json({ message: 'Deleted!' });
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteNotes = async (req, res) => {
    try {
        const { Notes } = await getModels('courses');

        const notes = await Notes.findById(req.params.id);
        if (!notes) throw { 'message': 'Notes not found!', 'status': 404 };

        // Delete this notes entry
        await notes.deleteOne();
        await cacheManager.invalidatePattern("nt:*");
        res.status(200).json(notes);
    } catch (err) {
        handleError(res, err);
    }
};
