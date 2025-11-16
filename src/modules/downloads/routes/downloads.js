const express = require('express');
const { getDownloads, getOneDownload, getDownloadsByUser, getDownloadsByCreator, createDownload, deleteDownload } = require('../controllers/downloads');
const { auth, authRole } = require('../../../middlewares/auth');

const router = express.Router();

// GET routes
router.get('/', getDownloads);
router.get('/downloaded-by/:id', auth, getDownloadsByUser);
router.get('/creator/:id', auth, getDownloadsByCreator);
router.get('/:id', getOneDownload);

// POST routes
router.post('/', createDownload);

// DELETE routes
router.delete('/:id', authRole(['Creator', 'Admin', 'SuperAdmin']), deleteDownload);

module.exports = router;