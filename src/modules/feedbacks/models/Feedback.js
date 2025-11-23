const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const FeedbackSchema = new Schema({
  rating: {
    type: Number,
    required: true
  },
  comment: {
    type: String,
    required: false
  },
  user: {
    type: Schema.Types.ObjectId
  },
  score: {
    type: Schema.Types.ObjectId
  },
  quiz: {
    type: Schema.Types.ObjectId
  }
}, { timestamps: true });

module.exports.schema = FeedbackSchema;

