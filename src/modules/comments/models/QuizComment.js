const process = require("process");
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const { getDB } = require('../../../utils/db-manager');

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

module.exports = async function QuizCommentModel() {
    const db = await getDB("comments", process.env.COMMENTS_URI);
    return db.model("QuizComment", QuizCommentSchema);
};
