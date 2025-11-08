const express = require('express');
const { getNotes, getLimitedNotes, getNotesByCategory, getNotesByChapter, getOneNotes, getBatchedNotes, createNotes, updateNotesQuizzes, updateNotes, removeQuizFromNotes, deleteNotes } = require('../controllers/notes');
const { authRole } = require('../../../middlewares/auth.js');
const { notesUpload } = require('../../middlewares/notesUpload');

const router = express.Router();

// GET routes
router.get('/', getNotes);
router.get('/limited', getLimitedNotes);
router.get('/category/:id', getNotesByCategory);
router.get('/chapter/:id', getNotesByChapter);
router.get('/:id', getOneNotes); // Combine slug and id into one route
router.post('/batch', getBatchedNotes);

// POST routes
router.post('/', authRole(['Creator', 'Admin', 'SuperAdmin']), notesUpload.single('notes_file'), createNotes);

// PUT routes
router.put('/notes-quizzes/remove/:id', authRole(['Creator', 'Admin', 'SuperAdmin']), removeQuizFromNotes);
router.put('/notes-quizzes/:id', authRole(['Creator', 'Admin', 'SuperAdmin']), updateNotesQuizzes);
router.put('/:id', authRole(['Creator', 'Admin', 'SuperAdmin']), notesUpload.single('notes_file'), updateNotes);

// DELETE routes
router.delete('/:id', authRole(['Creator', 'Admin', 'SuperAdmin']), deleteNotes);

module.exports = router;