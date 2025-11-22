const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const { getDB } = require('../../../../utils/db-manager');

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

module.exports = async function PostCategoryModel() {
    const db = await getDB("posts", process.env.POSTS_URI);
    return db.model("PostCategory", PostCategorySchema);
};

