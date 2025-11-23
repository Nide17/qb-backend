const mongoose = require('mongoose');
const Schema = mongoose.Schema;

//create a schema object
const ChatRoomSchema = new Schema({
    name: {
        type: String,
        required: true
    },
    users: [{ type: Schema.Types.ObjectId, }]
}, { timestamps: true });

module.exports.schema = ChatRoomSchema;

