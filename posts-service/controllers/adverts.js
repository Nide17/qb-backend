const Advert = require('../models/Advert.js');
const { handleError } = require('../utils/error');
const { deleteImageFromS3, validateRequiredFields } = require('../utils/helpers');

exports.getAdverts = async (req, res) => {
    try {
    const adverts = await Advert.find().sort({ createdAt: -1 });
    if (!adverts) throw {'message':'No adverts found!','statusCode':204};
        res.status(200).json(adverts);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneAdvert = async (req, res) => {
    try {
    const advert = await Advert.findById(req.params.id);

    if (!advert) throw {'message':'Advert not found!','statusCode':404};
    res.status(200).json(advert);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getActiveAdverts = async (req, res) => {
    try {
    const adverts = await Advert.find({ status: 'Active' }).sort({ createdAt: -1 });
    if (!adverts) throw {'message':'No active adverts found!','statusCode':404};
    res.status(200).json(adverts);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getCreatedBy = async (req, res) => {
    try {
    const adverts = await Advert.find({ owner: req.params.id }).sort({ createdAt: -1 });
    if (!adverts) throw {'message':'No adverts found!','statusCode':404};
    res.status(200).json(adverts);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createAdvert = async (req, res) => {
    const { caption, phone, owner, email, link } = req.body;

    try {
        // Validate required fields
        validateRequiredFields([
            { name: 'caption', value: caption },
            { name: 'phone', value: phone },
            { name: 'owner', value: owner },
            { name: 'email', value: email }
        ]);

        if (!req.file) {
            throw new Error('FILE_MISSING');
        }

        const ad_file = req.file;

        const newAdvert = new Advert({
            caption,
            phone,
            owner,
            email,
            link,
            advert_image: ad_file.location ? ad_file.location : ad_file.path
        });

        const savedAdvert = await newAdvert.save();
        if (!savedAdvert) throw new Error('Something went wrong during creation!');

        res.status(200).json({
            _id: savedAdvert._id,
            caption: savedAdvert.caption,
            owner: savedAdvert.owner,
            phone: savedAdvert.phone,
            email: savedAdvert.email,
            link: savedAdvert.link,
            advert_image: savedAdvert.advert_image,
            createdAt: savedAdvert.createdAt
        });
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateAdvert = async (req, res) => {
    try {
    const advert = await Advert.findById(req.params.id);
    if (!advert) throw {'message':'Advert not found!','statusCode':404};

    const updatedAdvert = await Advert.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.status(200).json(updatedAdvert);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateAdvertStatus = async (req, res) => {
    try {
    const advert = await Advert.findById(req.params.id);
    if (!advert) throw {'message':'Advert not found!','statusCode':404};

    const updatedAdvert = await Advert.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    res.status(200).json(updatedAdvert);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteAdvert = async (req, res) => {
    try {
        const advert = await Advert.findById(req.params.id);
        if (!advert) throw new Error('Advert not found!');

        advert.advert_image && await deleteImageFromS3(advert.advert_image);
        const removedAdvert = await advert.deleteOne();
        if (removedAdvert.deletedCount === 0) throw new Error('Something went wrong during deletion!');

        res.status(200).json(advert);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteAdvertImage = async (req, res) => {
    try {
    const advert = await Advert.findById(req.params.id);
    if (!advert) throw {'message':'Advert not found!','statusCode':404};

    const updatedAdvert = await Advert.findByIdAndUpdate(req.params.id, { advert_image: '' }, { new: true });
    res.status(200).json(updatedAdvert);
    } catch (err) {
        handleError(res, err);
    }
};
