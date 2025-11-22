const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const UserModel = require('./models/User');
const { sendEmail } = require('../../utils/emails/sendEmail');

// Helper functions
const generateToken = (user) => {
    return jwt.sign({ _id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '2h' });
};

const updateUserToken = async (user) => {
    const token = generateToken(user);
    const User = await UserModel();
    return await User.findByIdAndUpdate({ _id: user._id }, { $set: { current_token: token } }, { new: true });
};

const sendOtpEmail = async (user, otp) => {
    await sendEmail(user.email,
        'One Time Password (OTP) verification for Quiz Blog account',
        { name: user.name, otp }, './template/otp.handlebars');
};

const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    if (!salt) throw { 'message': 'Something went wrong with bcrypt', 'status': 500 };
    const hash = await bcrypt.hash(password, salt);
    if (!hash) throw { 'message': 'Something went wrong hashing the password', 'status': 500 };
    return hash;
};

// Helper function to send subscription email
const sendSubscriptionEmail = (subscriber) => {
    const clientURL = process.env.NODE_ENV === 'production' ?
        process.env.DOMAIN_URL : process.env.LOCAL_DOMAIN_URL;

    sendEmail(
        subscriber.email,
        'Thank you for subscribing to Quiz-Blog!',
        {
            name: subscriber.name,
            unsubscribeLink: `${clientURL}/unsubscribe`
        },
        './template/subscribe.handlebars'
    );
};


const getBatchedUsersMap = async (usersIDs) => {

    try {
        if (!usersIDs || !Array.isArray(usersIDs) || usersIDs.length === 0) return new Map();

        const User = await UserModel();

        const users = await User.find({ _id: { $in: usersIDs } }).select('name email');
        if (!users.length) throw { 'message': 'No users found!', 'status': 404 };

        const usersMap = new Map();
        for (const user of users || []) {
            usersMap.set(user._id.toString(), user);
        }
        return usersMap;

    } catch (err) {
        console.error(err.message);
        return new Map();
    }
};

module.exports = {
    generateToken,
    updateUserToken,
    sendOtpEmail,
    hashPassword,
    sendSubscriptionEmail,
    getBatchedUsersMap,
};
