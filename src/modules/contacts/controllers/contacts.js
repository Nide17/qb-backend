const { getModels } = require('../../../utils/db-manager');
const { sendEmail } = require('../../../utils/emails/sendEmail');
const { handleError } = require('../../../utils/error');
const { cacheManager, cacheWrapper, validateRequiredFields } = require('../../../utils/global-helpers');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "ctc:all",
    ONE: (id) => `ctc:${id}`,
    PAGINATED: (pageNo) => `ctc:paginated:${pageNo}`,
    BY_SENDER: (sender) => `ctc:by_sender:${sender}`,
    DB_STATS: "ctc:db_stats"
};

exports.getContacts = async (req, res) => {

    try {
        // Pagination
        const { Contact } = await getModels('contacts');
        const totalPages = await Contact.countDocuments({});
        const PAGE_SIZE = 10;
        const pageNo = parseInt(req.query.pageNo || "0", 10);

        if (pageNo > 0) {
            const cacheKey = CACHE_KEYS.PAGINATED(pageNo);
            const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

                const contacts = await Contact.aggregate([
                    {
                        // 1. Compute last reply date
                        $addFields: {
                            lastReplyDate: { $max: "$replies.reply_date" }
                        }
                    },
                    {
                        // 2. Sort by last reply, fallback to contact date
                        $sort: {
                            lastReplyDate: -1,
                            contact_date: -1
                        }
                    },
                    {
                        // 3. Pagination
                        $skip: PAGE_SIZE * (pageNo - 1)
                    },
                    {
                        $limit: PAGE_SIZE
                    }
                ]);

                const result = { contacts, totalPages: Math.ceil(totalPages / PAGE_SIZE), currentPage: pageNo };
                return result;
            })
            return res.status(200).json(data);

        }
        else {
            const cacheKey = CACHE_KEYS.ALL;
            const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
                const contacts = await Contact.aggregate([
                    {
                        // Compute lastReplyDate from replies array
                        $addFields: {
                            lastReplyDate: { $max: "$replies.reply_date" }
                        }
                    },
                    {
                        // Sort by last reply date (fallback to contact_date if no replies)
                        $sort: {
                            lastReplyDate: -1,
                            contact_date: -1
                        }
                    }
                ]);

                return contacts;
            })
            return res.status(200).json(data);
        }
    } catch (err) {
        handleError(res, err);
    }
};

exports.getContactsBySender = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.BY_SENDER(req.params.email);
        const { Contact } = await getModels('contacts');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

            const contacts = await Contact.aggregate([
                {
                    // 1. Filter by email
                    $match: {
                        email: req.params.email
                    }
                },
                {
                    // 2. Compute lastReplyDate from replies array
                    $addFields: {
                        lastReplyDate: { $max: "$replies.reply_date" }
                    }
                },
                {
                    // 3. Sort by last reply, fallback to contact_date
                    $sort: {
                        lastReplyDate: -1,
                        contact_date: -1
                    }
                }
            ]);

            return contacts;
        })
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneContact = async (req, res) => {
    try {

        const cacheKey = CACHE_KEYS.ONE(req.params.id);
        const { Contact } = await getModels('contacts');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            let contact = await Contact.findById(req.params.id).lean();

            if (contact?.replies?.length) {
                contact.replies.sort(
                    (a, b) => new Date(b.reply_date) - new Date(a.reply_date)
                );
            }

            return contact;
        })
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createContact = async (req, res) => {
    try {

        const { contact_name, email, message, contact_date } = req.body;

        // Validation
        validateRequiredFields([
            { name: 'contact_name', value: contact_name },
            { name: 'email', value: email },
            { name: 'message', value: message },
            { name: 'contact_date', value: contact_date },
        ]);

        const { Contact } = await getModels('contacts');
        let newContact = await new Contact({ contact_name, email, message, contact_date });

        const savedContact = await newContact.save();
        if (!savedContact) {
            throw { 'status': 500, 'message': 'Something went wrong!' };
        }

        // Sending e-mail to contacted user
        sendEmail(
            savedContact.email,
            'Thank you for contacting Quiz-Blog!',
            { name: savedContact.contact_name },
            './template/contact.handlebars'
        );
        // Notify admins
        // await notifyAdmins(savedContact);
        await cacheManager.invalidatePattern("ctc:*");
        res.status(201).json(savedContact);
    } catch (err) {
        handleError(res, err);
    }
};

exports.addContactReply = async (req, res) => {
    try {
        // Convert message from raw to HTML
        // const rawContent = JSON.parse(req.body.message);
        // const contentState = convertFromRaw(rawContent);
        // const htmlMessage = stateToHTML(contentState);
        const { Contact } = await getModels('contacts');

        // Update the Quiz on Contact updating
        const updatedMessage = await Contact.findOneAndUpdate(
            { '_id': req.params.id },
            { $push: { 'replies': req.body } },
            { returnDocument: 'after' }
        );

        if (!updatedMessage) {
            throw { 'status': 500, 'message': 'Something went wrong while trying to update the contact' };
        }

        // // Send Reply email
        // sendEmail(
        //     req.body.to_contact,
        //     'New reply',
        //     {
        //         name: req.body.to_contact_name,
        //         question: req.body.contact_question,
        //         answer: htmlMessage,
        //     },
        //     './template/reply.handlebars'
        // );
        await cacheManager.invalidatePattern("ctc:*");
        res.status(200).json(updatedMessage);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteContact = async (req, res) => {
    try {
        const { Contact } = await getModels('contacts');
        const contact = await Contact.findByIdAndDelete(req.params.id);
        if (!contact) throw { message: 'Contact not found!', status: 404 };
        await cacheManager.invalidatePattern("ctc:*");
        res.status(200).json(contact);
    } catch (err) {
        handleError(res, err);
    }
};

// Get database statistics
exports.getDatabaseStats = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.DB_STATS;
        const { Contact } = await getModels('contacts');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
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

            return dbStats;
        });

        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};
