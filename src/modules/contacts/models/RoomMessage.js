// Bring in Mongo
const mongoose = require('mongoose');

//initialize Mongo schema
const Schema = mongoose.Schema;

const { getConnection } = require('../../../utils/db-manager');
const conn = getConnection('contacts', process.env.CONTACTS_URI);

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

module.exports = conn.model('RoomMessage', RoomMessageSchema);
