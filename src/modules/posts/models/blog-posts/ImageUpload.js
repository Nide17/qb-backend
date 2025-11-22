const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const { getDB } = require('../../../../utils/db-manager');

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

module.exports = async function ImageUploadModel() {
    const db = await getDB("posts", process.env.POSTS_URI);
    return db.model("ImageUpload", ImageUploadSchema);
};
