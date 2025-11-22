const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const { getDB } = require('../../../utils/db-manager');

//create a schema object
const ContactSchema = new Schema({
    contact_name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    contact_date: {
        type: Date,
        default: Date.now
    },
    replies: {
        type: [
            {
                reply_name: {
                    type: String,
                    required: true
                },
                email: {
                    type: String,
                    required: true
                },
                message: {
                    type: String,
                    required: true
                },
                reply_date: {
                    type: Date,
                    default: Date.now
                }
            }
        ]
    }
});

module.exports = async function ContactModel() {
    const db = await getDB("contacts", process.env.CONTACTS_URI);
    return db.model("Contact", ContactSchema);
};

