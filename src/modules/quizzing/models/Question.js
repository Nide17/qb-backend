const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const slugify = require('slugify');

const { getDB } = require('../../../utils/db-manager');


//create a schema object
const QuestionSchema = new Schema({
    questionText: {
        type: String,
        required: true
    },
    question_image: String,
    answerOptions: {
        type: [
            {
                answerText: {
                    type: String,
                    required: true
                },
                explanations: {
                    type: String,
                    required: false,
                    default: null
                },
                isCorrect: {
                    type: Boolean,
                    required: true,
                    default: false
                }
            }
        ]
    },
    category: {
        type: Schema.Types.ObjectId,
        ref: 'Category'
    },
    quiz: {
        type: Schema.Types.ObjectId,
        ref: 'Quiz'
    },
    created_by: {
        type: Schema.Types.ObjectId,
    },
    last_updated_by: {
        type: Schema.Types.ObjectId,
    },
    creation_date: {
        type: Date,
        default: Date.now
    },
    duration: {
        type: Number,
        required: true,
        default: 40
    },
    slug: {
        type: String,
        required: true,
    },
});

QuestionSchema.pre('validate', function (next) {
    const question = this;

    if (question.questionText) {
        question.slug = slugify(`${question.questionText}`, { replacement: '-', lower: true, strict: true });
    }
    next();
});

module.exports = async function QuestionModel() {
    const db = await getDB("quizzing", process.env.QUIZZING_URI);
    return db.model("Question", QuestionSchema);
};
