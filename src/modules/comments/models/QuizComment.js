const mongoose = require('mongoose');
const Schema = mongoose.Schema;

//create a schema object
const QuizCommentSchema = new Schema({
    comment: {
        type: String,
        required: true
    },
    sender: {
        type: Schema.Types.ObjectId,
    },
    quiz: {
        type: Schema.Types.ObjectId,
    }
}, { timestamps: true });

module.exports.schema = QuizCommentSchema;
