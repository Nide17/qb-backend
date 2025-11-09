const Broadcast = require('../models/Broadcast');
const { handleError } = require('../../../utils/error');
const { notifyAdmins, sendEmails } = require('../helpers');
const { validateRequiredFields, redisCache, getCachedData, setCachedData } = require('../../../utils/global-helpers');
const SubscribedUser = require('../../users/models/SubscribedUser');
const User = require('../../users/models/User');

const keysToClear = new Set();
exports.getBroadcasts = async (req, res) => {
    try {
        const cacheKey = 'broadcasts_all';
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);
        const broadcasts = await Broadcast.find().sort({ createdAt: -1 });
        await setCachedData(cacheKey, broadcasts) && keysToClear.add(cacheKey);
        res.status(200).json(broadcasts);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneBroadcast = async (req, res) => {
    try {
        const broadcast = await Broadcast.findById(req.params.id);
        if (broadcast) res.status(200).json(broadcast);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createBroadcast = async (req, res) => {
    const { title, sent_by, message } = req.body;

    try {
        // Validation
        validateRequiredFields([
            { name: 'title', value: title },
            { name: 'sent_by', value: sent_by },
            { name: 'message', value: message }
        ]);

        const clientURL = process.env.NODE_ENV === 'production' ? 'https://quizblog.rw' : 'http://localhost:5173';

        const newBroadcast = new Broadcast({ title, sent_by, message });
        const savedBroadcast = await newBroadcast.save();
        if (!savedBroadcast) throw { 'status': 503, 'message': 'Something went wrong during creation!' };

        // Use cached data to get subscribers and all users
        const subscribers = await getCachedData('subscribed_users') || await SubscribedUser.find().select('email name -_id');
        const allUsers = await getCachedData('all_users') || await User.find().select('email name -_id');

        // Send emails to subscribers and all users
        sendEmails(subscribers, title, message, clientURL);
        sendEmails(allUsers, title, message, clientURL);

        // Notify admins using the generalized utility function
        await notifyAdmins(newBroadcast);
        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(savedBroadcast);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateBroadcast = async (req, res) => {
    try {
        const broadcast = await Broadcast.findById(req.params.id);
        if (!broadcast) return;

        const updatedBroadcast = await Broadcast.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updatedBroadcast);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteBroadcast = async (req, res) => {
    try {
        const broadcast = await Broadcast.findById(req.params.id);
        if (!broadcast) return;

        const removedBroadcast = await Broadcast.findByIdAndDelete(req.params.id);
        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(removedBroadcast);
    } catch (err) {
        handleError(res, err);
    }
};
