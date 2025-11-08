const SubscribedUser = require('../models/SubscribedUser');
const { handleError } = require('../../../utils/error');
const { validateRequiredFields, sendSubscriptionEmail } = require('../helpers');

exports.getSubscribedUsers = async (req, res) => {
    try {
        const subscribedUsers = await SubscribedUser.find().sort({ createdAt: -1 });
        if (!subscribedUsers) throw { 'message': 'No subscribed users found!', 'status': 204 };
        res.status(200).json(subscribedUsers);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneSubscribedUser = async (req, res) => {
    try {
        const subscribedUser = await SubscribedUser.findById(req.params.id).select('name email createdAt');
        if (!subscribedUser) throw { 'message': 'No subscribed user found!', 'status': 404 };
        return res.status(200).json(subscribedUser);
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
        const subscriber = await SubscribedUser.findOne({ email });
        if (subscriber) {
            throw { 'message': 'You are already subscribed!', 'status': 400 };
        }

        const newSubscriber = new SubscribedUser({ name, email });
        const savedSubscriber = await newSubscriber.save();
        if (!savedSubscriber) {
            throw { 'message': 'Failed to subscribe!', 'status': 400 };
        }

        // Sending e-mail to subscribed user
        sendSubscriptionEmail(savedSubscriber);

        res.status(200).json(savedSubscriber);
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateSubscribedUser = async (req, res) => {
    try {
        const updatedSubscribedUser = await SubscribedUser.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json(updatedSubscribedUser);
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteSubscribedUser = async (req, res) => {
    try {
        const subscribedUser = await SubscribedUser.findById(req.params.id);
        if (!subscribedUser) throw { 'message': 'Subscribed user not found!', 'status': 404 };

        const removedSubscribedUser = await subscribedUser.deleteOne();
        if (removedSubscribedUser.deletedCount === 0) throw { 'message': 'Something went wrong while deleting!', 'status': 500 };

        res.status(200).json(subscribedUser);
    } catch (err) {
        handleError(res, err);
    }
};
