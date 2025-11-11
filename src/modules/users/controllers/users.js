// Import dependencies
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendEmail } = require('../../../utils/emails/sendEmail');
const User = require('../models/User');
const Faculty = require('../../schools/models/Faculty');
const PswdResetToken = require('../models/PswdResetToken');
const { handleError } = require('../../../utils/error');
const { deleteImageFromS3, redisCache, getCachedData, setCachedData } = require('../../../utils/global-helpers');
const { hashPassword, updateUserToken } = require('../helpers');

const keysToClear = new Set();
// Get all users
exports.getUsers = async (req, res) => {

    try {
        const cacheKey = `all_users`;
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);

        const limit = req.query.limit ? parseInt(req.query.limit) : 0;
        const filter = req.query.filter ? req.query.filter : ''; // Eg: name, school, level, faculty, interests, about, image
        let users = await User.find(filter ? { [filter]: { $exists: true } } : {}).limit(limit).sort({ register_date: -1 }).select('name email role register_date' + (filter ? ` ${filter}` : ''));
        if (!users.length) throw { 'message': 'No users found!', 'status': 404 };

        // Set cache
        await setCachedData(cacheKey, users, 60 * 60) && keysToClear.add(cacheKey);
        res.status(200).json(users);
    } catch (err) {
        handleError(res, err);
    }
};

// Get 8 latest users
exports.getLatestUsers = async (req, res) => {
    try {

        const cacheKey = `latest-users`;

        // Check cache first
        const cached = await getCachedData(cacheKey);

        if (cached) return res.status(200).json(cached);
        let users = await User.find().sort({ register_date: -1 }).select('name email role image register_date').limit(8);
        if (!users.length) throw { 'message': 'No users found!', 'status': 404 };

        // Set cache
        await setCachedData(cacheKey, users) && keysToClear.add(cacheKey);
        res.status(200).json(users);
    } catch (err) {
        handleError(res, err);
    }
};

// Get Admin and Creators users
exports.getAdminsCreators = async (req, res) => {
    try {
        const cacheKey = `admins-creators`;

        // Check cache first
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);

        let adminsCreators = await User.find({ role: { $in: ['Admin', 'SuperAdmin', 'Creator'] } }).select('name email role image register_date');
        if (!adminsCreators.length) throw { 'message': 'No users found!', 'status': 404 };

        // Set cache
        await setCachedData(cacheKey, adminsCreators) && keysToClear.add(cacheKey);
        res.status(200).json(adminsCreators);
    } catch (err) {
        handleError(res, err);
    }
};

// Get one user by ID
exports.getOneUser = async (req, res) => {

    try {
        let user = await User.findById(req.params.id).select('-password -__v -verified -otp -otpExpires -register_date -last_login').lean();
        if (!user) throw { 'message': 'User not found!', 'status': 404 };

        // Expand user school details
        if (user.school && user.level && user.faculty) {
            const faculty = await Faculty
                .findById(user.faculty)
                .populate('level school', 'title')
                .select('title level school')
                .lean();
            if (faculty) {
                user.faculty = { _id: faculty?._id, title: faculty?.title };
                user.level = { _id: faculty?.level?._id, title: faculty?.level?.title };
                user.school = { _id: faculty?.school?._id, title: faculty?.school?.title };
            }
        }
        res.status(200).json(user);
    } catch (err) {
        handleError(res, err);
    }
};

// Load user by token
exports.loadUser = async (req, res) => {
    try {
        const cacheKey = `user_${req?.user?._id}`;

        // Check cache first
        const cached = await getCachedData(cacheKey);
        if (cached) return res.status(200).json(cached);

        // If no cache, get user from database
        let user = await User.findById(req?.user?._id).select('-password -__v -verified -otp -otpExpires -register_date -last_login').lean();
        if (!user) throw { 'message': 'No active session!', 'status': 404 };

        // Expand user school details
        if (user.school && user.level && user.faculty) {
            const faculty = await Faculty
                .findById(user.faculty)
                .populate('level school', 'title')
                .select('title level school')
                .lean();
            if (faculty) {
                user.faculty = { _id: faculty?._id, title: faculty?.title };
                user.level = { _id: faculty?.level?._id, title: faculty?.level?.title };
                user.school = { _id: faculty?.school?._id, title: faculty?.school?.title };
            }
        }
        // Set cache
        await setCachedData(cacheKey, user, 60 * 15) && keysToClear.add(cacheKey);
        res.status(200).json(user);
    } catch (err) {
        handleError(res, err);
    }
};

// User login
exports.login = async (req, res) => {

    try {
        const { email, password, confirmLogin } = req.body;
        if (!email || !password) throw { 'status': 400, 'message': 'Please fill all fields' };

        const user = await User.findOne({ email });
        if (!user) throw { 'status': 404, 'message': 'User not found' };

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) throw { 'status': 400, 'message': 'Incorrect E-mail or Password!' };

        if (!user.verified && new Date(user.register_date) > new Date('2024-12-09')) {
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            await User.findOneAndUpdate({ email }, { otp });
            await sendEmail(email, otp);
            throw { 'status': 400, 'message': 'Account not verified yet, check your email for OTP!' };
        }

        try {
            jwt.verify(user.current_token, process.env.JWT_SECRET, async (err) => {
                try {
                    if (!user.current_token || err) {
                        const updatedUser = await updateUserToken(user);
                        if (!updatedUser) throw { 'status': 500, 'message': 'Could not log you in, try again later!' };

                        res.status(200).json({
                            current_token: updatedUser.current_token,
                            user: updatedUser
                        });
                    } else {
                        if (!confirmLogin) {
                            throw { 'status': 401, 'message': 'Already logged in, Log out & use here', 'code': 'CONFIRM_ERR' };
                        } else {
                            const confirmedUser = await updateUserToken(user);
                            if (!confirmedUser) throw { 'status': 500, 'message': 'Could not log you in, try again later!' };

                            res.status(200).json({
                                current_token: confirmedUser.current_token,
                                user: confirmedUser,
                            });
                        }
                    }
                } catch (innerError) {
                    handleError(res, innerError);
                }
            });
        } catch (error) {
            handleError(res, error);
        }
    } catch (err) {
        handleError(res, err);
    }
};

// User logout
exports.logout = async (req, res) => {
    try {
        const loggedOutUser = await User.findByIdAndUpdate(
            req.body.userId,
            { $set: { current_token: null } },
            { new: true }
        );
        if (!loggedOutUser) throw { 'status': 404, 'message': 'User not found!' };

        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(loggedOutUser);
    } catch (err) {
        handleError(res, err);
    }
};

// User registration
exports.register = async (req, res) => {

    try {
        const { name, email, password } = req.body;
        const emailTest = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,4}$/i;
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        if (!name || !email || !password) throw { 'status': 400, 'message': 'Please fill all fields' };
        if (!emailTest.test(email)) throw { 'status': 400, 'message': 'Please provide a valid email!' };

        const user = await User.findOne({ email });
        const hash = await hashPassword(password);

        if (user && (user.verified === true)) {
            throw { 'status': 400, 'message': 'User already exists, login instead!' };
        }

        // If user already and not verified, update user
        await User.findOneAndUpdate({ email }, { name, password: hash, otp });
        await sendEmail(email, 'One Time Password (OTP) verification for Quiz Blog account', { name, otp }, './template/otp.handlebars');
        console.log('existing user otp: ', otp);

        // If user does not exist, create a new one
        if (!user) {

            const newUser = new User({ name, email, password: hash, otp, verified: false });
            const savedUser = await newUser.save();

            if (!savedUser) throw { status: 500, message: 'Could not save user, try again!' };

            await sendEmail(email, 'One Time Password (OTP) verification for Quiz Blog account', { name, otp }, './template/otp.handlebars');
            console.log('new user\'s otp: ', otp);
        }

        // del cache
        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(savedUser);
    } catch (err) {
        handleError(res, err);
    }
};

// Verify OTP
exports.verifyOTP = async (req, res) => {

    try {

        const { email, otp } = req.body;
        if (!email || !otp) throw { 'status': 400, 'message': 'Email and OTP are required!' };

        const usr = await User.findOne({ email }).select('-password');

        if (!usr) throw { 'status': 400, 'message': 'User does not exist' };
        if (otp !== usr.otp) throw { 'status': 400, 'message': 'Invalid OTP provided.' };

        await User.findOneAndUpdate({ email }, { verified: true });
        const updatedUser = await updateUserToken(usr);
        if (!updatedUser) throw { status: 500, message: 'Could not verify user, try again!' };

        res.status(200).json({
            current_token: updatedUser.current_token,
            user: {
                _id: updatedUser._id,
                name: updatedUser.name,
                email: updatedUser.email,
                role: updatedUser.role
            }
        });
    } catch (err) {
        handleError(res, err, 500);
    }
};

// Send password reset link
exports.sendResetLink = async (req, res) => {
    try {
        const email = req.body.email;
        const userToReset = await User.findOne({ email });
        if (!userToReset) {
            throw { 'status': 404, 'message': 'User with that email does not exist!' };
        }

        let token = await PswdResetToken.findOne({ userId: userToReset._id });
        if (token) await token.deleteOne();

        let resetToken = crypto.randomBytes(32).toString('hex');
        const hash = await hashPassword(resetToken);
        await new PswdResetToken({
            userId: userToReset._id,
            token: hash,
            register_date: Date.now(),
        }).save();

        const clientURL = req.headers.origin;
        const link = `${clientURL}/reset-password?token=${resetToken}&id=${userToReset._id}`;

        sendEmail(
            userToReset.email,
            'Password reset for your Quiz-Blog account!',
            { name: userToReset.name, link: link },
            './template/requestResetPassword.handlebars'
        ).then(async () => {
            res.status(200).json({ message: 'Reset email sent successfully', status: 200 });
        }).catch((err) => {
            handleError(res, { status: 500, message: 'Failed to send reset link to your email!' }, 500);
        });
    } catch (err) {
        handleError(res, err);
    }
};

// Send new password
exports.sendNewPassword = async (req, res) => {
    try {
        const { userId, token, password } = req.body;
        let passwordResetToken = await PswdResetToken.findOne({ userId });
        if (!passwordResetToken) throw { 'status': 400, 'message': 'Invalid or expired link, try resetting again!' };

        const isValid = await bcrypt.compare(token, passwordResetToken.token);
        if (!isValid) throw { 'status': 400, 'message': 'Invalid link, try resetting again!' };

        const hash = await hashPassword(password);
        await User.updateOne({ _id: userId }, { $set: { password: hash } }, { new: true });

        const resetUser = await User.findById({ _id: userId });
        sendEmail(
            resetUser.email,
            'Password reset for your Quiz-Blog account is successful!',
            { name: resetUser.name },
            './template/resetPassword.handlebars'
        );

        await passwordResetToken.deleteOne();
        res.status(200).json({ message: 'Password reset successful!', status: 200 });
    } catch (err) {
        handleError(res, err);
    }
};

// Update profile image
exports.updateProfileImage = async (req, res) => {
    try {
        if (!req.file) throw { 'status': 400, 'message': 'Profile image is required!' };
        const img_file = req.file;

        const user = await User.findOne({ _id: req.params.id });
        if (!user) throw { 'status': 404, 'message': 'Failed! user not exists!' };
        user.image && await deleteImageFromS3(user.image);
        let updatedUserProfile = await User.findByIdAndUpdate({ _id: req.params.id }, { image: img_file.location }, { new: true }).lean();

        // Expand user school details
        if (updatedUserProfile.school && updatedUserProfile.level && updatedUserProfile.faculty) {
            const faculty = await Faculty
                .findById(updatedUserProfile.faculty)
                .populate('level school', 'title')
                .select('title level school')
                .lean();
            if (faculty) {
                updatedUserProfile.faculty = { _id: faculty?._id, title: faculty?.title };
                updatedUserProfile.level = { _id: faculty?.level?._id, title: faculty?.level?.title };
                updatedUserProfile.school = { _id: faculty?.school?._id, title: faculty?.school?.title };
            }
        }
        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(updatedUserProfile);
    } catch (err) {
        handleError(res, err);
    }
};

// Update profile
exports.updateProfile = async (req, res) => {
    try {
        let user = await User.findByIdAndUpdate({ _id: req.params.id }, req.body, { new: true }).lean();
        if (!user) throw { 'status': 404, 'message': 'User not found!' };

        // Expand user school details
        if (user.school && user.level && user.faculty) {
            const faculty = await Faculty
                .findById(user.faculty)
                .populate('level school', 'title')
                .select('title level school')
                .lean();
            if (faculty) {
                user.faculty = { _id: faculty?._id, title: faculty?.title };
                user.level = { _id: faculty?.level?._id, title: faculty?.level?.title };
                user.school = { _id: faculty?.school?._id, title: faculty?.school?.title };
            }
        }
        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(user);
    } catch (err) {
        handleError(res, err);
    }
};

// Update user
exports.updateUser = async (req, res) => {
    try {
        let user = await User.findByIdAndUpdate({ _id: req.params.id }, req.body, { new: true }).lean();
        if (!user) throw { 'status': 404, 'message': 'User not found!' };

        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(user);
    } catch (err) {
        handleError(res, err);
    }
};

// Delete user
exports.deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) throw { 'status': 404, 'message': 'User not found!' };

        const removedUser = await User.deleteOne({ _id: req.params.id });
        if (removedUser.deletedCount === 0) throw { 'status': 500, 'message': 'Failed to delete user!' };

        // del cache
        await redisCache.invalidateKeysCache(keysToClear);
        res.status(200).json(user);
    } catch (err) {
        handleError(res, err);
    }
};
