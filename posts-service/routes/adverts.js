const express = require('express');
const { getAdverts, getOneAdvert, getActiveAdverts, getCreatedBy, createAdvert, updateAdvertStatus, updateAdvert, deleteAdvert } = require('../controllers/adverts');
const { authRole } = require('../middlewares/auth');
const { advertUpload } = require('../middlewares/advertUpload');

const router = express.Router();

// GET routes
router.get('/', getAdverts);
router.get('/active', getActiveAdverts);
router.get('/created-by/:id', getCreatedBy);
router.get('/:id', getOneAdvert);

// POST routes
router.post('/', authRole(['Admin', 'SuperAdmin']), advertUpload.single('advert_image'), createAdvert);

// PUT routes
router.put('/:id', authRole(['Admin', 'SuperAdmin']), updateAdvert);
router.put('/status/:id', authRole(['Admin', 'SuperAdmin']), updateAdvertStatus);

// DELETE routes
router.delete('/:id', authRole(['Admin', 'SuperAdmin']), deleteAdvert);

module.exports = router;