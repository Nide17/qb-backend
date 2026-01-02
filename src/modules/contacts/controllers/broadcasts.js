const process = require("process");
const { handleError } = require('../../../utils/error');
const { notifyAdmins, sendEmails } = require('../helpers');
const { validateRequiredFields, cacheManager, cacheWrapper } = require('../../../utils/global-helpers');
const { getModels } = require('../../../utils/db-manager');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "brd:all",
    ONE: (id) => `brd:${id}`,
};

exports.getBroadcasts = async (req, res) => {
    try {
        const { Broadcast } = await getModels('contacts');

        const data = await cacheWrapper.wrap(CACHE_KEYS.ALL, CACHE_TTL, async () => {
            const broadcasts = await Broadcast.find().sort({ createdAt: -1 });
            return broadcasts;
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneBroadcast = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ONE(req.params.id);
        const { Broadcast } = await getModels('contacts');

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const broadcast = await Broadcast.findById(req.params.id);
            return broadcast;
        })

        res.status(200).json(data);
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

        const { Broadcast } = await getModels('contacts');
        const { SubscribedUser } = await getModels('users');
        // previously used UserModel; use `const { User } = await getModels('users')` if needed

        const newBroadcast = new Broadcast({ title, sent_by, message });
        const savedBroadcast = await newBroadcast.save();
        if (!savedBroadcast) throw { 'status': 503, 'message': 'Something went wrong during creation!' };

        const subscribers = await SubscribedUser.find();
        // const allUsers = await User.find();

        // Send emails to subscribers and all users
        sendEmails(subscribers, title, message, clientURL);
        // sendEmails(allUsers, title, message, clientURL);

        // Notify admins using the generalized utility function
        await notifyAdmins(newBroadcast);
        await cacheManager.invalidatePattern("brd:*");
        res.status(201).json(savedBroadcast);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateBroadcast = async (req, res) => {
    try {
        const { Broadcast } = await getModels('contacts');

        const broadcast = await Broadcast.findById(req.params.id);
        if (!broadcast) return;

        const updatedBroadcast = await Broadcast.findByIdAndUpdate(req.params.id, req.body, { new: true });
        await cacheManager.invalidatePattern("brd:*");
        res.status(200).json(updatedBroadcast);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteBroadcast = async (req, res) => {
    try {
        const { Broadcast } = await getModels('contacts');

        const broadcast = await Broadcast.findById(req.params.id);
        if (!broadcast) return;

        const removedBroadcast = await Broadcast.findByIdAndDelete(req.params.id);
        await cacheManager.invalidatePattern("brd:*");
        res.status(200).json(removedBroadcast);
    } catch (err) {
        handleError(res, err);
    }
};
