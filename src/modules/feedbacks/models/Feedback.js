const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const { getDB } = require('../../../utils/db-manager');

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

module.exports = async function FeedbackModel() {
  const db = await getDB("feedbacks", process.env.FEEDBACKS_URI);
  return db.model("Feedback", FeedbackSchema);
};

