// Bring in Mongo
const mongoose = require('mongoose');

//initialize Mongo schema
const Schema = mongoose.Schema;

const { getConnection } = require('../../db/dbManager');
const conn = getConnection('users', process.env.USERS_URI);

//create a schema object
const SubscribedUserSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  }
}, { timestamps: true });

module.exports = conn.model('SubscribedUser', SubscribedUserSchema);
