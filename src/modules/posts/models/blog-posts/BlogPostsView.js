const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const { getDB } = require('../../../../utils/db-manager');
// Create Schema for blogPostsView 
const BlogPostsViewSchema = new Schema({
    blogPost: {
        type: Schema.Types.ObjectId,
        ref: 'BlogPost'
    },
    viewer: {
        type: Schema.Types.ObjectId,
        required: false,
        default: null
    },
    device: {
        type: String,
        required: false,
        default: null
    },
    country: {
        type: String,
        required: false,
        default: null
    }
}, { timestamps: true, });

module.exports = async function BlogPostsViewModel() {
    const db = await getDB("posts", process.env.POSTS_URI);
    return db.model("BlogPostsView", BlogPostsViewSchema);
};
