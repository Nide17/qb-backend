// Bring in Mongo
const mongoose = require('mongoose');

//initialize Mongo schema
const Schema = mongoose.Schema;

const { getConnection } = require('../../db/dbManager');
const conn = getConnection('posts', process.env.POSTS_URI);

//create a schema object
const FaqSchema = new Schema({
    title: {
        type: String,
        required: true
    },
    answer: {
        type: String,
        required: true
    },
    created_by: {
        type: Schema.Types.ObjectId,
    },
    video_links: {
        type: [
            {
                vtitle: {
                    type: String,
                    required: true
                },
                vlink: {
                    type: String,
                    required: true
                }
            }
        ]
    }
}, { timestamps: true });

module.exports = conn.model('Faq', FaqSchema);
