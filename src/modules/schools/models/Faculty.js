// Bring in Mongo
const mongoose = require('mongoose');

//initialize Mongo schema
const Schema = mongoose.Schema;

//create a schema object
const FacultySchema = new Schema({
    title: {
        type: String,
        required: true,
        unique: true
    },
    school: {
        type: Schema.Types.ObjectId,
        ref: 'School'
    },
    level: {
        type: Schema.Types.ObjectId,
        ref: 'Level'
    },
    years: [
        {
            type: String,
            required: true,
        }
    ]
}, { timestamps: true });

module.exports = mongoose.model('Faculty', FacultySchema);