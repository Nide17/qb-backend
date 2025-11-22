const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const { getDB } = require('../../../utils/db-manager');

//create a schema object
const ChatRoomSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    users: [{ type: Schema.Types.ObjectId, }]
}, { timestamps: true });

module.exports = async function ChatRoomModel() {
    const db = await getDB("contacts", process.env.CONTACTS_URI);
    return db.model("ChatRoom", ChatRoomSchema);
};

