const Contact = require('../models/Contact');
const { sendEmail } = require('../../../utils/emails/sendEmail');
const { convertFromRaw } = require('draft-js');
const { stateToHTML } = require('draft-js-export-html');
const { handleError } = require('../../../utils/error');
const { notifyAdmins } = require('../helpers');
const { redisCache, getCachedData, setCachedData } = require('../../../utils/global-helpers');

const keysToClear = new Set();
exports.getContacts = async (req, res) => {

    try {
        // Pagination
        const totalPages = await Contact.countDocuments({});
        const PAGE_SIZE = 10;
        const pageNo = parseInt(req.query.pageNo || '0');
        const query = { limit: PAGE_SIZE, skip: PAGE_SIZE * (pageNo - 1) };

        let contacts = 0;

        if (pageNo > 0) {
            const cacheKey = `contacts_${query.limit}_${query.skip}`;
            const cached = await getCachedData(cacheKey);
            if (cached) return res.status(200).json(cached);

            contacts = await Contact.find({}, {}, query).sort({ contact_date: -1 });
            const result = { contacts, totalPages: Math.ceil(totalPages / PAGE_SIZE), currentPage: pageNo };
            await setCachedData(cacheKey, result) && keysToClear.add(cacheKey);
            return res.status(200).json(result);
        }
        else {
            const cacheKey = `contacts_all`;
            const cached = await getCachedData(cacheKey);
            if (cached) return res.status(200).json(cached);
            contacts = await Contact.find().sort({ contact_date: -1 });
            await setCachedData(cacheKey, contacts) && keysToClear.add(cacheKey);
            return res.status(200).json(contacts);
        }
    } catch (err) {
        handleError(res, err);
    }
};

exports.getContactsBySender = async (req, res) => {
    try {
        const cacheKey = `contacts_sent_by_${req.params.id}`;
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);
        const contacts = await Contact.find({ sent_by: req.params.id });
        await setCachedData(cacheKey, contacts) && keysToClear.add(cacheKey);
        res.status(200).json(contacts);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneContact = async (req, res) => {
    try {
        const contact = await Contact.findById(req.params.id);
        res.status(200).json(contact);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createContact = async (req, res) => {
    try {
        const newContact = await Contact.create(req.body);
        if (!newContact) {
            throw { 'status': 500, 'message': 'Something went wrong!' };
        }

        // Sending e-mail to contacted user
        sendEmail(
            newContact.email,
            'Thank you for contacting Quiz-Blog!',
            { name: newContact.contact_name },
            './template/contact.handlebars'
        );
        // Notify admins
        await notifyAdmins(newContact);
        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(newContact);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateContact = async (req, res) => {
    try {
        // Convert message from raw to HTML
        const rawContent = JSON.parse(req.body.message);
        const contentState = convertFromRaw(rawContent);
        const htmlMessage = stateToHTML(contentState);

        // Update the Quiz on Contact updating
        const newMessage = await Contact.updateOne(
            { '_id': req.params.id },
            { $push: { 'replies': req.body } },
            { new: true }
        );

        if (!newMessage) {
            throw { 'status': 500, 'message': 'Something went wrong while trying to update the contact' };
        }

        // Send Reply email
        sendEmail(
            req.body.to_contact,
            'New reply',
            {
                name: req.body.to_contact_name,
                question: req.body.contact_question,
                answer: htmlMessage,
            },
            './template/reply.handlebars'
        );

        res.status(200).json(req.body);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteContact = async (req, res) => {
    try {
        const contact = await Contact.findByIdAndDelete(req.params.id);
        if (!contact) throw { message: 'Contact not found!', status: 404 };
        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(contact);
    } catch (err) {
        handleError(res, err);
    }
};

// Get database statistics
exports.getDatabaseStats = async (req, res) => {
    try {
        const cacheKey = 'contacts_db_stats';
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);

        const db = Contact.db;

        // Get stats for contacts collection using document sampling approach
        const contactsCollection = db.collection('contacts');
        const contactsCount = await contactsCollection.countDocuments();
        const contactSample = await contactsCollection.find({}).limit(50).toArray();
        const avgContactSize = contactSample.length > 0 ?
            contactSample.reduce((sum, doc) => sum + JSON.stringify(doc).length, 0) / contactSample.length : 0;
        const estimatedContactDataSize = contactsCount * avgContactSize;

        // Get aggregated contact data
        const pipeline = [
            {
                $group: {
                    _id: null,
                    totalContacts: { $sum: 1 },
                    avgMessageLength: { $avg: { $strLenCP: '$message' } },
                    repliedCount: { $sum: { $cond: [{ $ne: ['$reply', null] }, 1, 0] } }
                }
            }
        ];

        const aggregatedStats = await contactsCollection.aggregate(pipeline).toArray();
        const contactStats = aggregatedStats[0] || {};

        const dbStats = {
            service: 'contacts',
            timestamp: new Date().toISOString(),
            documents: contactsCount,
            totalDocuments: contactsCount,
            dataSize: estimatedContactDataSize,
            totalDataSize: estimatedContactDataSize,
            storageSize: Math.round(estimatedContactDataSize * 1.2),
            totalStorageSize: Math.round(estimatedContactDataSize * 1.2),
            indexSize: Math.round(estimatedContactDataSize * 0.1),
            totalIndexSize: Math.round(estimatedContactDataSize * 0.1),
            collections: {
                contacts: {
                    documents: contactsCount,
                    dataSize: estimatedContactDataSize,
                    avgDocumentSize: avgContactSize
                }
            },
            aggregatedStats: {
                totalContacts: contactStats.totalContacts || contactsCount,
                avgMessageLength: contactStats.avgMessageLength || 0,
                repliedCount: contactStats.repliedCount || 0,
                replyRate: contactsCount > 0 ? ((contactStats.repliedCount || 0) / contactsCount * 100).toFixed(2) + '%' : '0%'
            }
        };

        await setCachedData(cacheKey, dbStats) && keysToClear.add(cacheKey);
        res.status(200).json(dbStats);
    } catch (err) {
        handleError(res, err);
    }
};
