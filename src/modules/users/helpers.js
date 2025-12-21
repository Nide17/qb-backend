const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getModels } = require('../../utils/db-manager');
const { sendEmail } = require('../../utils/emails/sendEmail');

// Helper functions
const generateToken = (user) => {
    return jwt.sign({ _id: user._id, name: user.name, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '2h' });
};

// Utility helpers
const safeUserForResponse = (userObj) => {
    if (!userObj) return null;
    // Select only safe/public fields to return (and to cache)
    const { _id, name, email, role, image, school, faculty, level, year, interests, about, current_token, register_date, } = userObj;
    return {
        _id, name, email, role, image, school, faculty, level, year, interests, about, current_token, register_date,
    };
};

// simple email validation (permissive but practical)
const isValidEmail = (email) => {
    if (!email) return false;
    // as a pragmatic check allow valid patterns (avoid rejecting long new TLDs)
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const updateUserToken = async (user) => {

    const token = generateToken(user);

    const { User } = await getModels('users');
    const { Faculty } = await getModels('schools');

    const usr = await User.findByIdAndUpdate({ _id: user._id }, { $set: { current_token: token } }, { new: true });
    const userObj = usr.toObject();
    if (userObj && userObj.school && userObj.level && userObj.faculty) {

        const faculty = await Faculty
            .findById(userObj.faculty)
            .populate('level school', 'title')
            .select('title level school')
            .lean();

        if (faculty) {
            userObj.faculty = { _id: faculty?._id, title: faculty?.title };
            userObj.level = { _id: faculty?.level?._id, title: faculty?.level?.title };
            userObj.school = { _id: faculty?.school?._id, title: faculty?.school?.title };
        }
    }

    delete userObj.password;
    delete userObj.otp;
    delete userObj.otpExpires;
    delete userObj.__v;
    delete userObj.last_login;
    delete userObj.register_date;
    delete userObj.verified;
    userObj.current_token = usr.current_token;
    return userObj;
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

        const { User } = await getModels('users');

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

const expandSchoolData = async (rawUser) => {
    if (!rawUser) return rawUser;
    if (!(rawUser.school && rawUser.level && rawUser.faculty)) return rawUser;

    const { Faculty } = await getModels('schools');
    const faculty = await Faculty
        .findById(rawUser.faculty)
        .populate('level school', 'title')
        .select('title level school')
        .lean();

    if (faculty) {
        rawUser.faculty = { _id: faculty._id, title: faculty.title };
        rawUser.level = { _id: faculty.level?._id, title: faculty.level?.title };
        rawUser.school = { _id: faculty.school?._id, title: faculty.school?.title };
    }
    return rawUser;
};

module.exports = {
    generateToken,
    updateUserToken,
    safeUserForResponse,
    isValidEmail,
    sendOtpEmail,
    hashPassword,
    sendSubscriptionEmail,
    getBatchedUsersMap,
    expandSchoolData,
};
