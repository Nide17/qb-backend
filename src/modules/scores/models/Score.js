const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// The alternative to the export model pattern is the export schema pattern.
const ScoreSchema = new Schema({
    id: {
        type: String,
        required: true,
        unique: true
    },
    marks: {
        type: Number,
        default: 0,
        required: true
    },
    out_of: {
        type: Number,
        default: 0,
        required: true
    },
    test_date: {
        type: Date,
        default: Date.now
    },
    review: {
        title: {
            type: String,
            required: true,
        },
        description: {
            type: String,
            required: true
        },
        questions: [
            {
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
                            },
                            choosen: {
                                type: Boolean,
                                required: true,
                                default: false
                            }
                        }
                    ]
                }
            }
        ]

    },
    category: {
        type: Schema.Types.ObjectId,
    },
    quiz: {
        type: Schema.Types.ObjectId,
    },
    taken_by: {
        type: Schema.Types.ObjectId,
    }
});

module.exports.schema = ScoreSchema;
