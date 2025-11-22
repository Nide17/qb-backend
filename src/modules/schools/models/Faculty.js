const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const { getDB } = require('../../../utils/db-manager');

//create a schema object
const FacultySchema = new Schema({
    title: {
        type: String,
        required: true,
        unique: true
    },
    school: {
        type: Schema.Types.ObjectId,
        ref: 'School'
    },
    level: {
        type: Schema.Types.ObjectId,
        ref: 'Level'
    },
    years: [
        {
            type: String,
            required: true,
        }
    ]
}, { timestamps: true });

module.exports = async function FacultyModel() {
    const db = await getDB("schools", process.env.SCHOOLS_URI);
    return db.model("Faculty", FacultySchema);
};
