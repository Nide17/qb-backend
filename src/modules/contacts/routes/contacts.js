const express = require('express');
const { getContacts, getContactsBySender, getOneContact, createContact, addContactReply, deleteContact } = require('../controllers/contacts');
const { auth, authRole } = require('../../../middlewares/auth');

const router = express.Router();

// GET routes
router.get('/', getContacts);
router.get('/sender/:email', auth, getContactsBySender);
router.get('/:id', auth, getOneContact);

// POST routes
router.post('/', createContact);

// PUT routes
router.put('/:id', auth, addContactReply);

// DELETE routes
router.delete('/:id', authRole(['Admin', 'SuperAdmin']), deleteContact);

module.exports = router;