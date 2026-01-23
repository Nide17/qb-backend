const { getModels } = require('../../../utils/db-manager');
const { handleError } = require('../../../utils/error');
const { getBatchedUsersMap } = require('../../users/helpers');
const { getBatchedQuizzesMap } = require('../../quizzing/helpers');
const { validateRequiredFields, cacheManager, cacheWrapper, extractS3Key, deleteS3File, verifyS3FileDeletion } = require('../../../utils/global-helpers');

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
    const quizesIDs = [...new Set(notes.map(n => {
        let quizIDs = n.quizes?.map(q => q.toString());
        return quizIDs;
    }).flat())];

    // Get details as a Map
    const usersMap = await getBatchedUsersMap(usersIDs);
    const quizesMap = await getBatchedQuizzesMap(quizesIDs);

    // Map notes to expanded objects
    const expandedNotesUsers = notes.map(nt => {
        const expandedNote = { ...nt };
        if (nt.uploaded_by) expandedNote.uploaded_by = usersMap.get(nt.uploaded_by.toString());
        return expandedNote;
    });

    // Merge both maps
    const expandedNotes = expandedNotesUsers.map(nt => {
        const expandedNote = { ...nt };
        if (nt.quizes) expandedNote.quizes = nt.quizes.map(q => quizesMap.get(q.toString()));
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

            let notes = await Notes.findOne(query).populate('course chapter quizes courseCategory', 'title').lean();
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
        const newFile = req.file;

        if (!newFile) throw { message: 'Notes file is required!', status: 400 };

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
            description,
            notes_file: newFile && newFile.location,
            chapter,
            course,
            courseCategory,
            uploaded_by
        });

        const savedNotes = await newNotes.save();
        if (!savedNotes) throw { message: 'Could not save notes, try again!', status: 500 };

        await cacheManager.invalidatePattern("nt:*");
        res.status(201).json(savedNotes);

    } catch (err) {
        handleError(res, err);
    }
};

exports.updateNotes = async (req, res) => {
    try {
        const newFile = req.file;
        const notesId = req.params.id;

        const { Notes } = await getModels('courses');

        const existingNotes = await Notes.findById(notesId);
        if (!existingNotes) {
            return res.status(404).json({
                success: false,
                message: 'Notes not found!'
            });
        }

        let updates = { ...req.body };

        // Handle file replacement
        if (newFile) {
            // Extract old file key from existing notes
            const oldFileUrl = existingNotes.notes_file;
            const oldFileKey = extractS3Key(oldFileUrl);

            if (oldFileKey) {

                // Delete old file from S3
                const deleteSuccess = await deleteS3File(oldFileKey);

                if (deleteSuccess) {
                    // Optional: Verify deletion
                    const verified = await verifyS3FileDeletion(oldFileKey);
                    if (!verified) {
                        console.warn(`⚠️  File deletion could not be verified: ${oldFileKey}`);
                    }
                } else {
                    console.warn(`⚠️  Failed to delete old file, but continuing with update`);
                }
            } else {
                console.log(`📝 No valid old file key found, uploading new file only`);
            }

            // Update with new file location
            updates.notes_file = newFile.location;
            updates.file_name = newFile.originalname;
            updates.file_size = newFile.size;
            updates.updated_at = new Date();
        }

        // Update notes in database
        const updatedNotes = await Notes.findByIdAndUpdate(
            notesId,
            updates,
            { new: true, runValidators: true }
        );

        // Invalidate cache
        await cacheManager.invalidatePattern("nt:*");
        res.status(200).json(updatedNotes);
    } catch (err) {
        console.error('❌ Error updating notes:', err);
        handleError(res, err);
    }
};

exports.addQuizToNotes = async (req, res) => {
    try {
        const { Notes } = await getModels('courses');

        const note = await Notes.findOne({ _id: req.params.id });
        if (!note) throw { 'message': 'Notes not found!', 'status': 404 };

        // if quiz is already in the notes, raise an error
        if (note.quizes.includes(req.body.quizID)) throw { 'message': 'Quiz is already in the notes!', 'status': 400 };

        // Add this quiz to the notes
        const notes = await Notes.findOneAndUpdate(
            { '_id': req.params.id },
            { $push: { 'quizes': req.body.quizID } },
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

        await Notes.findOneAndUpdate(
            { _id: note._id },
            { $pull: { quizes: req.body.quizID } }
        );
        await cacheManager.invalidatePattern("nt:*");
        res.status(200).json(note);
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
