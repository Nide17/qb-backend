// Bring in Mongo
const mongoose = require('mongoose');
const slugify = require('slugify');

//initialize Mongo schema
const Schema = mongoose.Schema;

//create a schema object
const NotesSchema = new Schema({
    title: {
        type: String,
        required: true,
        unique: true
    },
    description: {
        type: String,
        required: true
    },
    notes_file: String,
    chapter: {
        type: Schema.Types.ObjectId,
        ref: 'Chapter'
    },
    course: {
        type: Schema.Types.ObjectId,
        ref: 'Course'
    },
    courseCategory: {
        type: Schema.Types.ObjectId,
        ref: 'CourseCategory'
    },
    slug: {
        type: String,
        required: true,
        unique: true
    },
    uploaded_by: {
        type: Schema.Types.ObjectId,
    },
    quizes: [
        {
            type: Schema.Types.ObjectId,
            default: []
        }
    ]
}, { timestamps: true });

NotesSchema.pre('validate', function (next) {
    const notes = this;

    if (notes.title) {
        notes.slug = slugify(`${notes.title}`, { replacement: '-', lower: true, strict: true });
    }
    next();
});

module.exports = mongoose.model('Notes', NotesSchema);