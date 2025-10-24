const express = require('express');
const { getFaculties, getFacultiesByLevel, getOneFaculty, createFaculty, updateFaculty, deleteFaculty } = require('../controllers/faculties');
const { authRole } = require('../middlewares/auth');

const router = express.Router();

// GET routes
router.get('/', getFaculties);
router.get('/level/:id', getFacultiesByLevel);
router.get('/:id', getOneFaculty);

// POST routes
router.post('/', authRole(['Admin', 'SuperAdmin']), createFaculty);

// PUT routes
router.put('/:id', authRole(['Admin', 'SuperAdmin']), updateFaculty);

// DELETE routes
router.delete('/:id', authRole(['Admin', 'SuperAdmin']), deleteFaculty);

module.exports = router;