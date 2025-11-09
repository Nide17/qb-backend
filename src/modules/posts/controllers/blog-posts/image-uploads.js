const ImageUpload = require('../../models/blog-posts/ImageUpload');
const User = require('../../../users/models/User');
const { getBatchedUsers } = require('../../../users/helpers');
const { deleteImageFromS3, redisCache, getCachedData, setCachedData } = require('../../../../utils/global-helpers');
const { handleError } = require('../../../../utils/error');

const keysToClear = new Set();
exports.getImageUploads = async (req, res) => {
    try {
        const cacheKey = `all_image_uploads`;
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);
        let imageUploads = await ImageUpload.find().sort({ createdAt: -1 });
        if (!imageUploads) throw { 'message': 'No image uploads found!', 'status': 204 };

        // Extract unique user IDs for better efficiency
        const usersIDs = [...new Set(imageUploads.map(i => i.owner?.toString()))];

        // Populate all user details in batch (assumed returns a map-like object or record)
        const batchedUsers = await getBatchedUsers(usersIDs);

        // Map imageUploads to expanded objects
        const expandedImageUploads = imageUploads.map(img => {
            const imgObj = img.toObject();
            const owner = batchedUsers.get(img.owner?.toString()) || img.owner;
            return { ...imgObj, owner };
        });

        const result = expandedImageUploads || imageUploads;

        // Set cache
        await setCachedData(cacheKey, result, 600) && keysToClear.add(cacheKey);
        res.status(200).json(result);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneImageUpload = async (req, res) => {
    try {
        let imageUpload = await ImageUpload.findById(req.params.id);
        if (!imageUpload) throw { status: 404, message: 'Image upload not found!' };

        // Populate user
        imageUpload = imageUpload.toObject ? imageUpload.toObject() : imageUpload;
        imageUpload.owner = await User.findById(imageUpload.owner).select('-password -__v -createdAt -updatedAt');
        res.status(200).json(imageUpload);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getImageUploadsByOwner = async (req, res) => {
    try {

        const cacheKey = `image_uploads_by_${req.params.id}`;
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);
        let imageUploads = await ImageUpload.find({ owner: req.params.id }).sort({ createdAt: -1 });
        if (!imageUploads) throw { 'message': 'No image uploads found!', 'status': 404 };

        // Extract unique user IDs for better efficiency
        const usersIDs = [...new Set(imageUploads.map(i => i.owner?.toString()))];

        // Populate all user details in batch (assumed returns a map-like object or record)
        const batchedUsers = await populateBatchedUsers(usersIDs);

        // Map imageUploads to expanded objects
        const expandedImageUploads = imageUploads.map(img => {
            const imgObj = img.toObject();
            const owner = batchedUsers.get(img.owner?.toString()) || img.owner;
            return { ...imgObj, owner };
        });
        const result = expandedImageUploads || imageUploads;

        // Set cache
        await setCachedData(cacheKey, result, 600) && keysToClear.add(cacheKey);
        res.status(200).json(result);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createImageUpload = async (req, res) => {

    try {
        const { imageTitle, owner } = req.body;

        if (!req.file) throw { message: 'Image file is required!', status: 400 };

        const imgUp_file = req.file;

        // Validate required fields
        validateRequiredFields([
            { name: 'imageTitle', value: imageTitle },
            { name: 'owner', value: owner },
            { name: 'uploadImage', value: imgUp_file }
        ]);
        // Check for duplicate imageTitle
        const imgUp = await ImageUpload.findOne({ imageTitle });
        if (imgUp) throw { 'message': 'Failed! Image with that name already exists!', 'status': 400 };

        const newImgUp = new ImageUpload({
            imageTitle,
            uploadImage: imgUp_file.location,
            owner
        });

        const savedImgUp = await newImgUp.save();
        if (!savedImgUp) throw { 'message': 'Something went wrong during creation! file size should not exceed 1MB', 'status': 500 };
        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(savedImgUp);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateImageUpload = async (req, res) => {
    try {
        const imageUpload = await ImageUpload.findById(req.params.id);
        if (!imageUpload) throw { 'message': 'Image upload not found!', 'status': 404 };

        const updatedImageUpload = await ImageUpload.findByIdAndUpdate(req.params.id, req.body, { new: true });
        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(updatedImageUpload);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteImageUpload = async (req, res) => {

    try {
        const imageUpload = await ImageUpload.findById(req.params.id);
        if (!imageUpload) throw { 'message': 'Image upload is not found!', 'status': 404 };

        imageUpload.uploadImage && await deleteImageFromS3(imageUpload.uploadImage);
        const removedImageUpload = await imageUpload.deleteOne();

        if (removedImageUpload.deletedCount === 0)
            throw { 'message': 'Something went wrong while deleting!', 'status': 503 };

        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(imageUpload);
    } catch (err) {
        handleError(res, err);
    }
};
