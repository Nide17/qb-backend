const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const { getDB } = require('../../../utils/db-manager');

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

module.exports = async function SubscribedUserModel() {
  const db = await getDB("users", process.env.USERS_URI);
  return db.model("SubscribedUser", SubscribedUserSchema);
};
