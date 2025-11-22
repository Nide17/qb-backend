const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const { getDB } = require('../../../utils/db-manager');

//create a schema object
const AdvertSchema = new Schema({
    caption: {
        type: String,
        required: true
    },
    owner: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    link: {
        type: String
    },
    advert_image: {
        type: String,
        required: true
    },
    status: { // Active, Inactive
        type: String,
        required: true,
        default: 'Inactive'
    }
}, { timestamps: true });

module.exports = async function AdvertModel() {
    const db = await getDB("posts", process.env.POSTS_URI);
    return db.model("Advert", AdvertSchema);
};
