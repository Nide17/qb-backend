// Bring in Mongo
const mongoose = require('mongoose');

//initialize Mongo schema
const Schema = mongoose.Schema;

const { getConnection } = require('../../../utils/db-manager');
const conn = getConnection('courses', process.env.COURSES_URI);

//create a schema object
const CourseCategorySchema = new Schema({
    title: {
        type: String,
        required: true,
        unique: true
    },
    description: {
        type: String,
        required: true
    },
    created_by: {
        type: Schema.Types.ObjectId,
    },
    last_updated_by: {
        type: Schema.Types.ObjectId,
    }
}, { timestamps: true });

module.exports = conn.model('CourseCategory', CourseCategorySchema);
