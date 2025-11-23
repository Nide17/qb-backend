const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const slugify = require('slugify');

//BlogPost Schema
const BlogPostSchema = new Schema({
    title: {
        type: String,
        required: true,
    },
    postCategory: {
        type: Schema.Types.ObjectId,
        ref: 'PostCategory'
    },
    post_image: String,
    markdown: {
        type: String,
        required: true,
    },
    slug: {
        type: String,
        required: true,
        unique: true
    },
    creator: {
        type: Schema.Types.ObjectId,
    },
    bgColor: {
        type: String,
        required: true,
        default: '#f3f3f2'
    },
}, { timestamps: true, });

BlogPostSchema.pre('validate', function (next) {
    const blogPost = this;

    if (blogPost.title) {
        blogPost.slug = slugify(`${blogPost.title}`, { replacement: '-', lower: true, strict: true });
    }
    next();
});

module.exports.schema = BlogPostSchema;
