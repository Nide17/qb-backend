const mongoose = require('mongoose');
const Schema = mongoose.Schema;

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

module.exports.schema = CourseCategorySchema;
