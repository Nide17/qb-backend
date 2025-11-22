const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const { getDB } = require('../../../utils/db-manager');

//create a schema object
const LevelSchema = new Schema({
    title: {
        type: String,
        required: true
    },
    school: {
        type: Schema.Types.ObjectId,
        ref: 'School'
    }
}, { timestamps: true });

module.exports = async function LevelModel() {
    const db = await getDB("schools", process.env.SCHOOLS_URI);
    return db.model("Level", LevelSchema);
};
