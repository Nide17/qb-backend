const ImageUpload = require('../../models/blog-posts/ImageUpload');
const User = require('../../../users/models/User');
const { getBatchedUsersMap } = require('../../../users/helpers');
const { deleteImageFromS3, cacheManager, cacheWrapper } = require('../../../../utils/global-helpers');
const { handleError } = require('../../../../utils/error');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "img:all",
    ONE: (id) => `img:${id}`,
    BY_OWNER: (id) => `img:own:${id}`
};
exports.getImageUploads = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ALL;
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            let imageUploads = await ImageUpload.find().sort({ createdAt: -1 }).lean();
            if (!imageUploads) throw { 'message': 'No image uploads found!', 'status': 404 };

            // Extract unique IDs
            const usersIDs = [...new Set(imageUploads.map(i => i.owner?.toString()))];

            // Get users details as a Map
            const usersMap = await getBatchedUsersMap(usersIDs);

            // Map imageUploads to expanded objects
            const expandedImageUploads = imageUploads.map(img => {
                const owner = usersMap.get(img.owner?.toString()) || img.owner;
                return { ...img, owner };
            });

            const result = expandedImageUploads || imageUploads;
            return result;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneImageUpload = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ONE(req.params.id)
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            let imageUpload = await ImageUpload.findById(req.params.id).lean();
            if (!imageUpload) throw { status: 404, message: 'Image upload not found!' };

            if (imageUpload.owner) {
                imageUpload.owner = await User.findById(imageUpload.owner).select('-password -__v -createdAt -updatedAt');
            }

            return imageUpload;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getImageUploadsByOwner = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.BY_OWNER(req.params.id);
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {

            let imageUploads = await ImageUpload.find({ owner: req.params.id }).sort({ createdAt: -1 }).lean();
            if (!imageUploads) throw { 'message': 'No image uploads found!', 'status': 404 };

            // Extract unique IDs
            const usersIDs = [...new Set(imageUploads.map(i => i.owner?.toString()))];

            // Get users details as a Map
            const usersMap = await getBatchedUsersMap(usersIDs);

            // Map imageUploads to expanded objects
            const expandedImageUploads = imageUploads.map(img => {
                const owner = usersMap.get(img.owner?.toString()) || img.owner;
                return { ...img, owner };
            });
            const result = expandedImageUploads || imageUploads;
            return result;
        });
        res.status(200).json(data);
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
        await cacheManager.invalidatePattern("img:*");
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
        await cacheManager.invalidatePattern("img:*");
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

        await cacheManager.invalidatePattern("img:*");
        res.status(200).json(imageUpload);
    } catch (err) {
        handleError(res, err);
    }
};
