const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const { getDB } = require('../../../utils/db-manager');

//create a schema object
const SchoolSchema = new Schema({
    title: {
        type: String,
        required: true,
        unique: true
    },
    location: {
        type: String,
        required: true
    },
    website: {
        type: String,
        required: true
    }
}, { timestamps: true });

module.exports = async function SchoolModel() {
    const db = await getDB("schools", process.env.SCHOOLS_URI);
    return db.model("School", SchoolSchema);
};
