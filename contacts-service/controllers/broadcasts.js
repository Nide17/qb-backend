const Broadcast = require('../models/Broadcast');
const { handleError } = require('../utils/error');
const { validateRequiredFields, notifyAdmins, sendEmails, getFromService } = require('../utils/helpers');

exports.getBroadcasts = async (req, res) => {
    try {
        const broadcasts = await Broadcast.find().sort({ createdAt: -1 });
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

        const subscribers = await getFromService(`${process.env.USERS_SERVICE_URL}/api/subscribed-users`);
        const allUsers = await getFromService(`${process.env.USERS_SERVICE_URL}/api/users`);

        sendEmails(subscribers, title, message, clientURL);
        sendEmails(allUsers, title, message, clientURL);

        // Notify admins using the generalized utility function
        await notifyAdmins(newBroadcast);

        res.status(200).json({
            _id: savedBroadcast._id,
            title: savedBroadcast.title,
            sent_by: savedBroadcast.sent_by,
            message: savedBroadcast.message,
            createdAt: savedBroadcast.createdAt
        });
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
        res.status(200).json(removedBroadcast);
    } catch (err) {
        handleError(res, err);
    }
};
