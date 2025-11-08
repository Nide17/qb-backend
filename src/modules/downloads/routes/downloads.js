const express = require('express');
const { getDownloads, getOneDownload, getNotesDownloader, getCreatorDownloads, getTop10Downloaders, getTop10Notes, createDownload, deleteDownload } = require('../controllers/downloads');
const { auth, authRole } = require('../../middlewares/auth');

const router = express.Router();

// GET routes
router.get('/', getDownloads);
router.get('/downloaded-by/:id', auth, getNotesDownloader);
router.get('/creator/:id', auth, getCreatorDownloads);
router.get('/top-10-downloaders', auth, getTop10Downloaders);
router.get('/top-10-notes', auth, getTop10Notes);
router.get('/:id', getOneDownload);

// POST routes
router.post('/', createDownload);

// DELETE routes
router.delete('/:id', authRole(['Creator', 'Admin', 'SuperAdmin']), deleteDownload);

module.exports = router;