const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const { getDB } = require('../../../utils/db-manager');

//create a schema object
const QuestionCommentSchema = new Schema({
    comment: {
        type: String,
        required: true
    },
    sender: {
        type: Schema.Types.ObjectId,
    },
    question: {
        type: Schema.Types.ObjectId,
    },
    quiz: {
        type: Schema.Types.ObjectId,
    },
    status: { // Pending - Approved - Rejected
        type: String,
        required: true,
        default: 'Pending'
    }
}, { timestamps: true });

module.exports = async function QuestionCommentModel() {
    const db = await getDB("comments", process.env.COMMENTS_URI);
    return db.model("QuestionComment", QuestionCommentSchema);
};

