const express = require('express');
const { getLevels, getLevelsBySchool, getOneLevel, createLevel, updateLevel, deleteLevel } = require('../controllers/levels');
const { authRole } = require('../middlewares/auth');

const router = express.Router();

// GET routes
router.get('/', getLevels);
router.get('/school/:id', getLevelsBySchool);
router.get('/:id', getOneLevel);

// POST routes
router.post('/', authRole(['Admin', 'SuperAdmin']), createLevel);

// PUT routes
router.put('/:id', authRole(['Admin', 'SuperAdmin']), updateLevel);

// DELETE routes
router.delete('/:id', authRole(['Admin', 'SuperAdmin']), deleteLevel);

module.exports = router;