const Faq = require('../models/Faq');
const { handleError } = require('../../../utils/error');
const { validateRequiredFields, redisCache, getCachedData, setCachedData } = require('../../../utils/global-helpers');

const keysToClear = new Set();
const handleFindByIdAndUpdate = async (id, update) => {
    try {
        const faq = await Faq.findById(id);
        if (!faq) throw { status: 404, message: 'Faq not found!' };

        const updatedFaq = await Faq.findByIdAndUpdate(id, update, { new: true });
        return updatedFaq ? (updatedFaq.toObject ? updatedFaq.toObject() : updatedFaq) : null;
    } catch (err) {
        throw err;
    }
};

exports.getFaqs = async (req, res) => {
    try {
        const cacheKey = `all_faqs`;
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);
        let faqs = await Faq.find().sort({ createdAt: -1 });
        if (!faqs) throw { status: 204, message: 'No faqs found!' };
        // Set cache
        await setCachedData(cacheKey, faqs, 600) && keysToClear.add(cacheKey);
        res.status(200).json(faqs);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneFaq = async (req, res) => {
    try {
        const faq = await Faq.findById(req.params.id);

        if (!faq) throw { status: 404, message: 'Faq not found!' };
        res.status(200).json(faq);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getCreatedBy = async (req, res) => {
    try {
        const faqs = await Faq.find({ created_by: req.params.id }).sort({ createdAt: -1 });
        if (!faqs) throw { status: 404, message: 'No faqs found!' };
        res.status(200).json(faqs);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createFaq = async (req, res) => {
    const { title, answer, created_by } = req.body;

    try {
        // Validate required fields
        validateRequiredFields([
            { name: 'title', value: title },
            { name: 'answer', value: answer },
            { name: 'created_by', value: created_by }
        ]);

        const newFaq = new Faq({ title, answer, created_by });
        const savedFaq = await newFaq.save();
        if (!savedFaq) throw { status: 503, message: 'Something went wrong during creation!' };

        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(savedFaq);
    } catch (err) {
        handleError(res, err);
    }
};

exports.addFaqVidLink = async (req, res) => {
    try {
        const updated = await handleFindByIdAndUpdate(req.params.id, { $push: { video_links: req.body } });
        res.status(200).json(updated);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateFaq = async (req, res) => {
    try {
        const updated = await handleFindByIdAndUpdate(req.params.id, req.body);
        res.status(200).json(updated);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteFaq = async (req, res) => {
    try {
        const faq = await Faq.findById(req.params.id);
        if (!faq) throw { status: 404, message: 'Faq not found!' };

        const removedFaq = await faq.deleteOne();
        if (removedFaq.deletedCount === 0) throw { status: 503, message: 'Something went wrong while deleting!' };
        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(faq);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteFaqVideo = async (req, res) => {
    try {
        const updated = await handleFindByIdAndUpdate(req.params.id, { $pull: { video_links: req.body } });
        res.status(200).json(updated);
    } catch (err) {
        handleError(res, err);
    }
};
