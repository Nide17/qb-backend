const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Create a schema object
const UserSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    required: true,
    default: 'Visitor'
  },
  image: {
    type: String
  },
  school: {
    type: Schema.Types.ObjectId,
  },
  level: {
    type: Schema.Types.ObjectId,
  },
  faculty: {
    type: Schema.Types.ObjectId,
  },
  year: {
    type: String
  },
  interests: {
    type: [
      {
        favorite: {
          type: String,
        }
      }
    ]
  },
  about: {
    type: String
  },
  current_token: {
    type: String
  },
  otp: {
    type: String,
    default: ''
  },
  otpExpires: {
    type: Date,
    expires: 900  // 15 minutes
  },
  verified: {
    type: Boolean,
    default: false
  },
  verified_date: {
    type: Date
  },
  register_date: {
    type: Date,
    default: Date.now
  },
  last_login: {
    type: Date
  }
});

// Provide schema for registry/attachModels usage
module.exports.schema = UserSchema;
