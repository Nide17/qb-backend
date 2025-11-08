// Bring in Mongo
const mongoose = require('mongoose');

//initialize Mongo schema
const Schema = mongoose.Schema;

//create a schema object
const DownloadSchema = new Schema({
    notes: {
        type: Schema.Types.ObjectId,
    },
    chapter: {
        type: Schema.Types.ObjectId,
    },
    course: {
        type: Schema.Types.ObjectId,
    },
    courseCategory: {
        type: Schema.Types.ObjectId,
    },
    downloaded_by: {
        type: Schema.Types.ObjectId,
    }
}, { timestamps: true });

module.exports = mongoose.model('Download', DownloadSchema);