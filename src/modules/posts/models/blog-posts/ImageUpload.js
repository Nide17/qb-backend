// Bring in Mongo
const mongoose = require('mongoose');

// Initialize Mongo schema
const Schema = mongoose.Schema;

const { getConnection } = require('../../../utils/db-manager');
const conn = getConnection('posts', process.env.POSTS_URI);

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

module.exports = conn.model('ImageUpload', ImageUploadSchema);
