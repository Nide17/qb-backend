const ImageUpload = require('../../models/blog-posts/ImageUpload');
const { handleError } = require('../../utils/error');
const { populateUser, findImageUploadById, validateRequiredFields, deleteImageFromS3 } = require('../../utils/helpers');

// Refactored code to use reusable utilities and align with patterns from other services.
exports.getImageUploads = async (req, res) => {
    try {
    let imageUploads = await ImageUpload.find().sort({ createdAt: -1 });
    if (!imageUploads) throw {'message':'No image uploads found!','statusCode':204};

        imageUploads = await Promise.all(imageUploads.map(async (imgUp) => await populateUser(imgUp.owner) || imgUp));
        res.status(200).json(imageUploads);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneImageUpload = async (req, res) => {
    try {
        const imageUpload = await findImageUploadById(req.params.id);
        if (imageUpload) res.status(200).json(imageUpload);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getImageUploadsByOwner = async (req, res) => {
    try {
    let imageUploads = await ImageUpload.find({ owner: req.params.id }).sort({ createdAt: -1 });
    if (!imageUploads) throw {'message':'No image uploads found!','statusCode':404};

        imageUploads = await Promise.all(imageUploads.map(async (imgUp) => await populateUser(imgUp.owner) || imgUp));

        res.status(200).json(imageUploads);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createImageUpload = async (req, res) => {

    try {
        const { imageTitle, owner } = req.body;

        if (!req.file) {
            throw new Error('FILE_MISSING');
        }

        const imgUp_file = req.file;

        // Validate required fields
        validateRequiredFields([
            { name: 'imageTitle', value: imageTitle },
            { name: 'owner', value: owner },
            { name: 'uploadImage', value: imgUp_file }
        ]);
        // Check for duplicate imageTitle
        const imgUp = await ImageUpload.findOne({ imageTitle });
        if (imgUp) throw new Error('Failed! Image with that name already exists!');

        const newImgUp = new ImageUpload({
            imageTitle,
            uploadImage: imgUp_file.location,
            owner
        });

        const savedImgUp = await newImgUp.save();
        if (!savedImgUp) throw new Error('Something went wrong during creation! file size should not exceed 1MB');

        res.status(200).json({
            _id: savedImgUp._id,
            imageTitle: savedImgUp.imageTitle,
            uploadImage: savedImgUp.uploadImage,
            owner: savedImgUp.owner,
            createdAt: savedImgUp.createdAt,
        });

    } catch (err) {
        handleError(res, err);
    }
};

exports.updateImageUpload = async (req, res) => {
    try {
        const imageUpload = await ImageUpload.findById(req.params.id);
    if (!imageUpload) throw {'message':'Image upload not found!','statusCode':404};

        const updatedImageUpload = await ImageUpload.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updatedImageUpload);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteImageUpload = async (req, res) => {

    try {
        const imageUpload = await ImageUpload.findById(req.params.id);
    if (!imageUpload) throw {'message':'Image upload is not found!','statusCode':404};

        imageUpload.uploadImage && await deleteImageFromS3(imageUpload.uploadImage);
        const removedImageUpload = await imageUpload.deleteOne();

        if (removedImageUpload.deletedCount === 0)
            throw {'message':'Something went wrong while deleting!','statusCode':503};

    } catch (err) {
        handleError(res, err);
    }
};