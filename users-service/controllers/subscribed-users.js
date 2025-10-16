const SubscribedUser = require("../models/SubscribedUser");
const { handleError } = require('../utils/error');
const { validateRequiredFields, sendSubscriptionEmail } = require("../utils/helpers")

exports.getSubscribedUsers = async (req, res) => {
    try {
        const subscribedUsers = await SubscribedUser.find().sort({ createdAt: -1 });
        if (!subscribedUsers) return res.status(204).json({ message: 'No subscribed users found!' });
        res.status(200).json(subscribedUsers);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneSubscribedUser = async (req, res) => {
    try {
        const subscribedUser = await SubscribedUser.findById(req.params.id).select('name email createdAt');
        if (!subscribedUser) return res.status(404).json({ message: 'No subscribed user found!' });
        return res.status(200).json(subscribedUser);
    } catch (err) {
        handleError(res, err);
    }
};

exports.createSubscribedUser = async (req, res) => {

    const { name, email } = req.body;

    // Validation
    validateRequiredFields([
        { name: 'name', value: name },
        { name: 'email', value: email },
    ]);

    try {
        const subscriber = await SubscribedUser.findOne({ email });
        if (subscriber) {
            return res.status(400).json({ message: 'You are already subscribed!' });
        }

        const newSubscriber = new SubscribedUser({ name, email });
        const savedSubscriber = await newSubscriber.save();
        if (!savedSubscriber) {
            return res.status(400).json({ message: 'Failed to subscribe!' });
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
    } catch (error) {
        handleError(res, error);
    }
};

exports.deleteSubscribedUser = async (req, res) => {
    try {
        const subscribedUser = await SubscribedUser.findById(req.params.id);
        if (!subscribedUser) return;

        const removedSubscribedUser = await subscribedUser.deleteOne();
        if (removedSubscribedUser.deletedCount === 0) return handleError(res, 'Something went wrong while deleting!');

        res.status(200).json(subscribedUser);
    } catch (err) {
        handleError(res, err);
    }
};
