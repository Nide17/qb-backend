const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const { getDB } = require('../../../utils/db-manager');

//create a schema object
const RoomMessageSchema = new Schema({
    sender: {
        type: Schema.Types.ObjectId,
    },
    receiver: {
        type: Schema.Types.ObjectId,
    },
    content: {
        type: String,
        required: true
    },
    room: {
        type: Schema.Types.ObjectId,
        ref: 'ChatRoom'
    }
}, { timestamps: true });

module.exports = async function RoomMessageModel() {
    const db = await getDB("contacts", process.env.CONTACTS_URI);
    return db.model("RoomMessage", RoomMessageSchema);
};

