const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const { getDB } = require('../../../utils/db-manager');

//create a schema object
const ChapterSchema = new Schema({
    title: {
        type: String,
        required: true,
        unique: true
    },
    description: {
        type: String,
        required: true
    },
    course: {
        type: Schema.Types.ObjectId,
        ref: 'Course'
    },
    courseCategory: {
        type: Schema.Types.ObjectId,
        ref: 'CourseCategory'
    },
    created_by: {
        type: Schema.Types.ObjectId,
    },
    last_updated_by: {
        type: Schema.Types.ObjectId,
    }
}, { timestamps: true });

module.exports = async function ChapterModel() {
    const db = await getDB("courses", process.env.COURSES_URI);
    return db.model("Chapter", ChapterSchema);
};
