// Bring in Mongo
const mongoose = require('mongoose');

//initialize Mongo schema
const Schema = mongoose.Schema;

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
        default: "Pending"
    }
}, { timestamps: true });

module.exports = mongoose.model('QuestionComment', QuestionCommentSchema);