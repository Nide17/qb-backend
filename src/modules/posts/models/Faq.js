const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const { getDB } = require('../../../utils/db-manager');

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

module.exports = async function FaqModel() {
    const db = await getDB("posts", process.env.POSTS_URI);
    return db.model("Faq", FaqSchema);
};
