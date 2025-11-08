// Bring in Mongo
const mongoose = require('mongoose');

//initialize Mongo schema
const Schema = mongoose.Schema;

const { getConnection } = require('../../../utils/db-manager');
const conn = getConnection('comments', process.env.COMMENTS_URI);

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

module.exports = conn.model('QuestionComment', QuestionCommentSchema);
