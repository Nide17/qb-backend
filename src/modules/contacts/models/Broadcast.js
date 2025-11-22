const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const { getDB } = require('../../../utils/db-manager');

//create a schema object
const BroadcastSchema = new Schema({
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    sent_by: {
        type: Schema.Types.ObjectId,
    }
},
    { timestamps: true });

module.exports = async function BroadcastModel() {
    const db = await getDB("contacts", process.env.CONTACTS_URI);
    return db.model("Broadcast", BroadcastSchema);
};
