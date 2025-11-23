const mongoose = require('mongoose');
const Schema = mongoose.Schema;

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

module.exports.schema = RoomMessageSchema;

