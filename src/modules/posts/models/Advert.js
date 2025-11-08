// Bring in Mongo
const mongoose = require('mongoose');

//initialize Mongo schema
const Schema = mongoose.Schema;

const { getConnection } = require('../../db/dbManager');
const conn = getConnection('posts', process.env.POSTS_URI);

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

module.exports = conn.model('Advert', AdvertSchema);
