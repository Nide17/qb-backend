// Import dependencies
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendEmail } = require('../utils/emails/sendEmail');
const User = require('../models/User');
const PswdResetToken = require('../models/PswdResetToken');
const { handleError } = require('../utils/error');
const { deleteImageFromS3, populateOneSchool, hashPassword, updateUserToken } = require('../utils/helpers');

// Get all users
exports.getUsers = async (req, res) => {

    try {
        const limit = req.query.limit ? parseInt(req.query.limit) : 0;
        const filter = req.query.filter ? req.query.filter : ''; // Eg: name, school, level, faculty, interests, about, image
        let users = await User.find(filter ? { [filter]: { $exists: true } } : {}).limit(limit).sort({ register_date: -1 }).select('name email role register_date' + (filter ? ` ${filter}` : ''));
        if (!users.length) throw { 'message': 'No users found!', 'status': 204 };

        res.status(200).json(users);
    } catch (err) {
        handleError(res, err);
    }
};

// Get 8 latest users
exports.getLatestUsers = async (req, res) => {
    try {
        let users = await User.find().sort({ register_date: -1 }).select('name email role image register_date').limit(8);
        if (!users.length) throw { 'message': 'No users found!', 'status': 404 };
        res.status(200).json(users);
    } catch (err) {
        handleError(res, err);
    }
};

// Get Admin and Creators users
exports.getAdminsCreators = async (req, res) => {
    try {
        let adminsCreators = await User.find({ role: { $in: ['Admin', 'SuperAdmin', 'Creator'] } }).select('name email role image register_date');
        if (!adminsCreators.length) throw { 'message': 'No users found!', 'status': 404 };
        res.status(200).json(adminsCreators);
    } catch (err) {
        handleError(res, err);
    }
};

// Get one user by ID
exports.getOneUser = async (req, res) => {

    try {
        let user = await User.findById(req.params.id).select('-password -__v -verified -otp -otpExpires -register_date -last_login');
        if (!user) throw { 'message': 'User not found!', 'status': 404 };

        // Expand user school details
        const expandeduser = await populateOneSchool(user);
        res.status(200).json(expandeduser || user);

    } catch (err) {
        handleError(res, err);
    }
};

// Load user by token
exports.loadUser = async (req, res) => {
    try {
        let user = await User.findById(req?.user?._id).select('-password -__v -verified -otp -otpExpires -register_date -last_login');

        if (!user) throw { 'message': 'No active session!', 'status': 204 };
        const expandeduser = await populateOneSchool(user);
        return res.status(200).json(expandeduser || user);
    } catch (err) {
        handleError(res, err);
    }
};

// Get emails of all admins
exports.getAdminsEmails = async (req, res) => {
    try {
        const admins = await User.find({ role: { $in: ['Admin', 'SuperAdmin'] } }).select('email');
        if (!admins) throw { 'message': 'No admins found!', 'status': 404 };
        const adminEmails = admins.map(admin => admin.email);
        return res.status(200).json(adminEmails);
    } catch (err) {
        handleError(res, err);
    }
};

// Get batched users: by IDs list from the post body
exports.getBatchedUsers = async (req, res) => {

    const userIDs = req.body?.userIDs;

    try {
        if (!userIDs || !Array.isArray(userIDs) || userIDs.length === 0) throw { 'message': 'No user IDs provided!', 'status': 400 };

        const users = await User.find({ _id: { $in: userIDs } }).select('name email');
        if (!users.length) throw { 'message': 'No users found!', 'status': 404 };
        res.status(200).json(users);
    } catch (err) {
        handleError(res, err);
    }
};

// Get daily user registration statistics
exports.getDailyUserRegistration = async (req, res) => {
    try {
        const usersStats = await User.aggregate([
            {
                $project: {
                    register_date_CAT: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: { $add: ['$register_date', 2 * 60 * 60 * 1000] }
                        }
                    }
                }
            },
            {
                $group: {
                    _id: '$register_date_CAT',
                    users: { $sum: 1 }
                }
            },
            {
                $sort: { _id: 1 }
            },
            {
                $project: {
                    _id: 0,
                    date: '$_id',
                    users: 1
                }
            }
        ]).exec();

        res.status(200).json(usersStats);
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

        jwt.verify(user.current_token, process.env.JWT_SECRET, async (err) => {
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
        });
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
        res.status(200).json({ message: 'Good Bye!', status: 200 });
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

        res.status(200).json({ message: 'Registration successful! Please verify your email to login.', email });
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
            },
            message: 'Account verified now!', status: 200
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
        if (!passwordResetToken) {
            throw { 'status': 400, 'message': 'Invalid or expired link, try resetting again!' };
        }

        const isValid = await bcrypt.compare(token, passwordResetToken.token);
        if (!isValid) {
            throw { 'status': 400, 'message': 'Invalid link, try resetting again!' };
        }

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

        let updatedUserProfile = await User.findByIdAndUpdate({ _id: req.params.id }, { image: img_file.location }, { new: true });

        // Expand user school details
        const expandeduser = await populateOneSchool(updatedUserProfile);
        res.status(200).json(expandeduser || updatedUserProfile);
    } catch (err) {
        handleError(res, err);
    }
};

// Update profile
exports.updateProfile = async (req, res) => {
    try {
        let user = await User.findByIdAndUpdate({ _id: req.params.id }, req.body, { new: true });

        // Expand user school details
        const expandeduser = await populateOneSchool(user);
        res.status(200).json(expandeduser || user);
    } catch (err) {

        handleError(res, err);
    }
};

// Update user
exports.updateUser = async (req, res) => {
    try {
        let user = await User.findByIdAndUpdate({ _id: req.params.id }, req.body, { new: true });

        if (!user) throw { 'status': 404, 'message': 'User not found!' };

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

        res.status(200).json(user);
    } catch (err) {
        handleError(res, err);
    }
};
