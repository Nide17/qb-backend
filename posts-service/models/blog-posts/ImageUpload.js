// Bring in Mongo
const mongoose = require('mongoose');

// Initialize Mongo schema
const Schema = mongoose.Schema;

// ImageUpload Schema
const ImageUploadSchema = new Schema({
    imageTitle: {
        type: String,
        required: true,
    },
    uploadImage: {
        type: String,
        required: true,
    },
    owner: {
        type: Schema.Types.ObjectId,
        required: true,
    }
}, { timestamps: true });

module.exports = mongoose.model('ImageUpload', ImageUploadSchema);
