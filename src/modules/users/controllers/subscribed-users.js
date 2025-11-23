const { getModels } = require('../../../utils/db-manager');
const { handleError } = require('../../../utils/error');
const { sendSubscriptionEmail } = require('../helpers');
const { validateRequiredFields, cacheManager, cacheWrapper } = require('../../../utils/global-helpers');

const CACHE_TTL = 600; // 10 minutes
const CACHE_KEYS = {
    ALL: "sub:all",
    ONE: (id) => `sub:${id}`,
};

exports.getSubscribedUsers = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ALL;
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const { SubscribedUser } = await getModels('users');
            return await SubscribedUser.find().sort({ createdAt: -1 });
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneSubscribedUser = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ONE(req.params.id);
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const { SubscribedUser } = await getModels('users');
            return await SubscribedUser.findById(req.params.id).select('name email createdAt');
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createSubscribedUser = async (req, res) => {

    try {
        const { name, email } = req.body;

        // Validation
        validateRequiredFields([
            { name: 'name', value: name },
            { name: 'email', value: email },
        ]);
        const { SubscribedUser } = await getModels('users');
        const subscriber = await SubscribedUser.findOne({ email });
        if (subscriber) {
            throw { 'message': 'You are already subscribed!', 'status': 400 };
        }

        const newSubscriber = new SubscribedUser({ name, email });
        const savedSubscriber = await newSubscriber.save();
        if (!savedSubscriber) throw { 'message': 'Failed to subscribe!', 'status': 400 };
        // Sending e-mail to subscribed user
        sendSubscriptionEmail(savedSubscriber);
        await cacheManager.invalidatePattern("sub:*");
        res.status(200).json(savedSubscriber);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateSubscribedUser = async (req, res) => {
    try {
        const { SubscribedUser } = await getModels('users');
        const updatedSubscribedUser = await SubscribedUser.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updatedSubscribedUser);
        await cacheManager.invalidatePattern("sub:*");
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteSubscribedUser = async (req, res) => {
    try {
        const { SubscribedUser } = await getModels('users');
        const subscribedUser = await SubscribedUser.findById(req.params.id);
        if (!subscribedUser) throw { 'message': 'Subscribed user not found!', 'status': 404 };

        const removedSubscribedUser = await subscribedUser.deleteOne();
        if (removedSubscribedUser.deletedCount === 0) throw { 'message': 'Something went wrong while deleting!', 'status': 500 };

        await cacheManager.invalidatePattern("sub:*");
        res.status(200).json(subscribedUser);
    } catch (err) {
        handleError(res, err);
    }
};
