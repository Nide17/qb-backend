const mongoose = require('mongoose');
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

module.exports.schema = ImageUploadSchema;
