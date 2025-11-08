const express = require('express');
const { getSchools, getOneSchool, createSchool, updateSchool, deleteSchool } = require('../controllers/schools');
const { authRole } = require('../middlewares/auth');

const router = express.Router();

// GET routes
router.get('/', getSchools);
router.get('/:id', getOneSchool);

// POST routes
router.post('/', authRole(['Admin', 'SuperAdmin']), createSchool);

// PUT routes
router.put('/:id', authRole(['Admin', 'SuperAdmin']), updateSchool);

// DELETE routes
router.delete('/:id', authRole(['Admin', 'SuperAdmin']), deleteSchool);

module.exports = router;