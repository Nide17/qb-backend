// Bring in Mongo
const mongoose = require('mongoose');

// Initialize Mongo schema
const Schema = mongoose.Schema;

const { getConnection } = require('../../db/dbManager');
const conn = getConnection('users', process.env.USERS_URI);

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
    default: Date.now,
    expires: 900  // 15 minutes
  },
  verified: {
    type: Boolean,
    default: false
  },
  register_date: {
    type: Date,
    default: Date.now
  }
});

module.exports = conn.model('User', UserSchema);
