const mongoose = require('mongoose');
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

// Provide schema for registry/attachModels usage
module.exports.schema = DownloadSchema;

