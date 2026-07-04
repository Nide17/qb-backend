const { getModels } = require('../../../utils/db-manager');
const { handleError } = require('../../../utils/error');
const { deleteS3File, validateRequiredFields, cacheManager, cacheWrapper } = require('../../../utils/global-helpers');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "ad:all",
    ONE: (id) => `ad:${id}`,
    ACTIVE: "ad:active",
    BY_CREATOR: (id) => `ad:creator:${id}`,
};

exports.getAdverts = async (req, res) => {
    try {
        const { Advert } = await getModels('posts');

        const cacheKey = CACHE_KEYS.ALL;
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await Advert.find().sort({ createdAt: -1 }).select('-__v -updatedAt');
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneAdvert = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ONE(req.params.id);
        const { Advert } = await getModels('posts');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await Advert.findById(req.params.id);
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getActiveAdverts = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ACTIVE;
        const { Advert } = await getModels('posts');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await Advert.find({ status: 'Active' }).sort({ createdAt: -1 }).select('-__v -updatedAt');
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getCreatedBy = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.BY_CREATOR(req.params.id);
        const { Advert } = await getModels('posts');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            return await Advert.find({ owner: req.params.id }).sort({ createdAt: -1 });
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createAdvert = async (req, res) => {

    try {
        const { caption, phone, owner, email, link } = req.body;

        // Validate required fields
        validateRequiredFields([
            { name: 'caption', value: caption },
            { name: 'phone', value: phone },
            { name: 'owner', value: owner },
            { name: 'email', value: email }
        ]);

        if (!req.file) throw { message: 'Advert image file is required!', status: 400 };

        const { Advert } = await getModels('posts');

        const newAdvert = new Advert({
            caption,
            phone,
            owner,
            email,
            link,
            advert_image: req.file.location ? req.file.location : req.file.path
        });

        const savedAdvert = await newAdvert.save();
        if (!savedAdvert) throw { message: 'Something went wrong during creation!', status: 500 };
        await cacheManager.invalidatePattern("ad:*");
        res.status(201).json(savedAdvert);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateAdvert = async (req, res) => {
    try {
        const { Advert } = await getModels('posts');

        const advert = await Advert.findById(req.params.id);
        if (!advert) throw { 'message': 'Advert not found!', 'status': 404 };

        const updatedAdvert = await Advert.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
        await cacheManager.invalidatePattern("ad:*");
        res.status(200).json(updatedAdvert);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateAdvertStatus = async (req, res) => {
    try {
        const { Advert } = await getModels('posts');

        const advert = await Advert.findById(req.params.id);
        if (!advert) throw { 'message': 'Advert not found!', 'status': 404 };
        const updatedAdvert = await Advert.findByIdAndUpdate(req.params.id, { status: req.body.status }, { returnDocument: 'after' });
        await cacheManager.invalidatePattern("ad:*");
        res.status(200).json(updatedAdvert);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteAdvert = async (req, res) => {
    try {
        const { Advert } = await getModels('posts');

        const advert = await Advert.findById(req.params.id);
        if (!advert) throw { message: 'Advert not found!', status: 404 };

        advert.advert_image && await deleteS3File(advert.advert_image);
        const removedAdvert = await advert.deleteOne();
        if (removedAdvert.deletedCount === 0) throw { message: 'Something went wrong during deletion!', status: 500 };
        await cacheManager.invalidatePattern("ad:*");
        res.status(200).json(advert);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteAdvertImage = async (req, res) => {
    try {
        const { Advert } = await getModels('posts');

        const advert = await Advert.findById(req.params.id);
        if (!advert) throw { 'message': 'Advert not found!', 'status': 404 };

        const updatedAdvert = await Advert.findByIdAndUpdate(req.params.id, { advert_image: '' }, { returnDocument: 'after' });
        await deleteS3File(advert.advert_image);
        await cacheManager.invalidatePattern("ad:*");
        res.status(200).json(updatedAdvert);
    } catch (err) {
        handleError(res, err);
    }
};
