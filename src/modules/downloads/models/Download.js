const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const { getDB } = require('../../../utils/db-manager');

//create a schema object
const DownloadSchema = new Schema({
    notes: {
        type: Schema.Types.ObjectId,
    },
    chapter: {
        type: Schema.Types.ObjectId,
    },
    course: {
        type: Schema.Types.ObjectId,
    },
    courseCategory: {
        type: Schema.Types.ObjectId,
    },
    downloaded_by: {
        type: Schema.Types.ObjectId,
    }
}, { timestamps: true });

module.exports = async function DownloadModel() {
    const db = await getDB("downloads", process.env.DOWNLOADS_URI);
    return db.model("Download", DownloadSchema);
};

