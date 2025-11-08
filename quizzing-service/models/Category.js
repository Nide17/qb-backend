// Bring in Mongo
const mongoose = require('mongoose');
const slugify = require('slugify');//initialize Mongo schema
const Schema = mongoose.Schema;

//create a schema object
const CategorySchema = new Schema({
  title: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    required: true
  },
  quizes: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Quiz'
    }
  ],
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
  courseCategory: {
    type: Schema.Types.ObjectId,
  },
  slug: {
    type: String,
    required: true,
  },
});

CategorySchema.pre('validate', function (next) {
  const category = this;

  if (category.title) {
    category.slug = slugify(`${category.title}`, { replacement: '-', lower: true, strict: true });
  }
  next();
});

module.exports = mongoose.model('Category', CategorySchema);