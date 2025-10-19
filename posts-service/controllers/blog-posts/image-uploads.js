const ImageUpload = require("../../models/blog-posts/ImageUpload");
const { handleError } = require('../../utils/error');
const { populateUser, findImageUploadById, validateRequiredFields } = require('../../utils/helpers');

// Refactored code to use reusable utilities and align with patterns from other services.
exports.getImageUploads = async (req, res) => {
    try {
        let imageUploads = await ImageUpload.find().sort({ createdAt: -1 });
        if (!imageUploads) return res.status(204).json({ message: 'No image uploads found!' });

        imageUploads = await Promise.all(imageUploads.map(async (imgUp) => await populateUser(imgUp.owner) || imgUp));
        res.status(200).json(imageUploads);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneImageUpload = async (req, res) => {
    const imageUpload = await findImageUploadById(req.params.id, ImageUpload, res);
    if (imageUpload) res.status(200).json(imageUpload);
};

exports.getImageUploadsByOwner = async (req, res) => {
    try {
        let imageUploads = await ImageUpload.find({ owner: req.params.id }).sort({ createdAt: -1 });
        if (!imageUploads) return res.status(404).json({ message: 'No image uploads found!' });

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
        if (!imageUpload) return res.status(404).json({ message: 'Image upload not found!' });

        const updatedImageUpload = await ImageUpload.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updatedImageUpload);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteImageUpload = async (req, res) => {

    try {
        const imageUpload = await ImageUpload.findById(req.params.id)
        if (!imageUpload) return res.status(404).json({ message: 'Image upload is not found!' })

        if (imageUpload.uploadImage) {
            const params = {
                Bucket: process.env.S3_BUCKET,
                Key: imageUpload.uploadImage.split('/').pop()
            }

            try {
                await s3Config.deleteObject(params, (err, data) => {
                    if (err) {
                        res.status(400).json({ message: err.message })
                        console.log(err, err.stack) // an error occurred
                    }
                    else {
                        res.status(200).json({ message: 'deleted!' })
                        console.log(params.Key + ' deleted from ' + params.Bucket)
                    }
                })

            }
            catch (err) {
                console.log('ERROR in file Deleting : ' + JSON.stringify(err))
                res.status(400).json({
                    message: 'Failed to delete! ' + err.message,
                    success: false
                })
            }
        }

        const removedImageUpload = await imageUpload.deleteOne()

        if (!removedImageUpload)
            return res.status(503).json({ message: 'Something went wrong while deleting!' });

    } catch (err) {
        handleError(res, err);
    }
};