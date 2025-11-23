const mongoose = require('mongoose');
const Schema = mongoose.Schema;

//create a schema object
const SchoolSchema = new Schema({
    title: {
        type: String,
        required: true,
        unique: true
    },
    location: {
        type: String,
        required: true
    },
    website: {
        type: String,
        required: true
    }
}, { timestamps: true });

module.exports.schema = SchoolSchema;
