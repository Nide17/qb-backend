// Bring in Mongo
const mongoose = require('mongoose');

//initialize Mongo schema
const Schema = mongoose.Schema;

const { getConnection } = require('../../../utils/db-manager');
const conn = getConnection('feedbacks', process.env.FEEDBACKS_URI);

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

module.exports = conn.model('Feedback', FeedbackSchema);
