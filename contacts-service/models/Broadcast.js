// Bring in Mongo
const mongoose = require('mongoose');

//initialize Mongo schema
const Schema = mongoose.Schema;

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

module.exports = mongoose.model('Broadcast', BroadcastSchema);