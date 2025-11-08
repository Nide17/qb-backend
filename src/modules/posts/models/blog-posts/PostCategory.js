// Bring in Mongo
const mongoose = require('mongoose');

//initialize Mongo schema
const Schema = mongoose.Schema;

//create a schema object
const PostCategorySchema = new Schema({
    title: {
        type: String,
        required: true,
        unique: true
    },
    description: {
        type: String,
        required: true
    },
    creator: {
        type: Schema.Types.ObjectId
    }
}, { timestamps: true });

module.exports = mongoose.model('PostCategory', PostCategorySchema);