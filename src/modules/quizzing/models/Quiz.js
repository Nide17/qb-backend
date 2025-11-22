const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const slugify = require('slugify');

const { getDB } = require('../../../utils/db-manager');

//create a schema object
const QuizSchema = new Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: Schema.Types.ObjectId,
    ref: 'Category',
  },
  questions: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Question'
    }
  ],
  created_by: {
    type: Schema.Types.ObjectId,
    validate: {
      validator: mongoose.Types.ObjectId.isValid,
      message: props => `${props.value} is not a valid ObjectId`
    }
  },
  last_updated_by: {
    type: Schema.Types.ObjectId,
    validate: {
      validator: mongoose.Types.ObjectId.isValid,
      message: props => `${props.value} is not a valid ObjectId`
    }
  },
  creation_date: {
    type: Date,
    default: Date.now
  },
  slug: {
    type: String,
    required: true,
  },
  video_links: {
    type: [
      {
        vtitle: {
          type: String,
          required: true
        },
        vlink: {
          type: String,
          required: true
        }
      }
    ]
  }
});

QuizSchema.pre('validate', function (next) {
  const quiz = this;

  if (quiz.title) {
    quiz.slug = slugify(`${quiz.title}`, { replacement: '-', lower: true, strict: true });
  }
  next();
});

module.exports = async function QuizModel() {
  const db = await getDB("quizzing", process.env.QUIZZING_URI);
  return db.model("Quiz", QuizSchema);
};
