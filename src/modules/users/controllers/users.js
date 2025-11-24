// controllers/users.controller.js

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const { getModels } = require('../../../utils/db-manager');
const { sendEmail } = require('../../../utils/emails/sendEmail');
const { handleError } = require('../../../utils/error');
const { deleteImageFromS3, cacheManager, cacheWrapper } = require('../../../utils/global-helpers');

const {
    hashPassword,
    updateUserToken,
} = require('../helpers');

const CACHE_TTL = 600; // seconds
const CACHE_KEYS = {
    ALL: 'usr:all',
    ONE: (id) => `usr:${id}`,
    CURRENT: (id) => `usr:current:${id}`,
    LATEST8: 'usr:latest8',
    ADMINSCREATORS: 'usr:adminscreators',
};

// -----------------------
// Utility helpers
// -----------------------
const safeUserForResponse = (userObj) => {
    if (!userObj) return null;
    // Select only safe/public fields to return (and to cache)
    const { _id, name, email, role, image, school, faculty, level, year, interests, about, current_token, register_date, } = userObj;
    return {
        _id, name, email, role, image, school, faculty, level, year, interests, about, current_token, register_date,
    };
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

const invalidateAllUserCaches = async () => {
    // Keep it broad: updates often affect multiple cached lists
    await cacheManager.invalidatePattern('usr:*');
};

// simple email validation (permissive but practical)
const isValidEmail = (email) => {
    if (!email) return false;
    // as a pragmatic check allow valid patterns (avoid rejecting long new TLDs)
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// -----------------------
// Controller actions
// -----------------------

exports.getUsers = async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 0;
        const filter = req.query.filter ? String(req.query.filter).trim() : '';

        const { User } = await getModels('users');

        if (filter || limit) {
            const query = filter ? { [filter]: { $exists: true } } : {};
            let users = await User.find(query)
                .limit(limit)
                .sort({ register_date: -1 })
                .select('name email role register_date ' + (filter ? filter : ''));
            if (!users || users.length === 0) {
                return res.status(404).json({ message: 'No users found' });
            }
            // always send safe subset
            users = users.map(u => safeUserForResponse(u));
            return res.status(200).json(users);
        }

        // cached full list (safe fields only)
        const cacheKey = CACHE_KEYS.ALL;
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const docs = await User.find().sort({ createdAt: -1 }).select('name email role register_date image');
            return docs.map(d => safeUserForResponse(d));
        });

        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getLatestUsers = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.LATEST8;
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const { User } = await getModels('users');
            const docs = await User.find().sort({ register_date: -1 }).select('name email role image register_date').limit(8);
            if (!docs || docs.length === 0) throw { message: 'No users found', status: 404 };
            return docs.map(d => safeUserForResponse(d));
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getAdminsCreators = async (req, res) => {
    try {
        const cacheKey = CACHE_KEYS.ADMINSCREATORS;
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const { User } = await getModels('users');
            const docs = await User.find({ role: { $in: ['Admin', 'SuperAdmin', 'Creator'] } })
                .select('name email role image register_date');
            if (!docs || docs.length === 0) throw { message: 'No users found', status: 404 };
            return docs.map(d => safeUserForResponse(d));
        });
        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.getOneUser = async (req, res) => {
    try {
        const id = req.params.id;
        const cacheKey = CACHE_KEYS.ONE(id);

        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const { User } = await getModels('users');

            const user = await User.findById(id)
                .select('-password -__v -verified -otp -otpExpires -register_date -last_login')
                .lean();

            if (!user) throw { message: 'User not found', status: 404 };
            await expandSchoolData(user);
            return safeUserForResponse(user);
        });

        res.status(200).json(data);
    } catch (err) {
        handleError(res, err);
    }
};

exports.loadUser = async (req, res, next) => {
    try {
        const userId = req?.user?._id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const cacheKey = CACHE_KEYS.CURRENT(userId);
        const data = await cacheWrapper.wrap(cacheKey, CACHE_TTL, async () => {
            const { User } = await getModels('users');
            let user = await User.findById(userId).select('-password -__v -otp -otpExpires -register_date -last_login').lean();
            if (!user) return null;
            await expandSchoolData(user);
            return safeUserForResponse(user);
        });

        if (!data) return res.status(404).json({ message: 'User not found' });
        res.status(200).json(data);
    } catch (err) {
        next(err);
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password, confirmLogin } = req.body;
        if (!email || !password) throw { status: 400, message: 'Please fill all fields' };

        const { User } = await getModels('users');
        const user = await User.findOne({ email }).lean();
        if (!user) throw { status: 404, message: 'User not found' };

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) throw { status: 400, message: 'Incorrect email or password' };

        // If account unverified and registered after a date, send OTP
        if (!user.verified && new Date(user.register_date) > new Date('2024-12-09')) {
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const otpExpires = Date.now() + (10 * 60 * 1000); // 10 minutes
            await User.findOneAndUpdate({ email }, { otp, otpExpires });
            await sendEmail(email, 'One Time Password (OTP) verification for Quiz Blog account', { name: user.name, otp }, './template/otp.handlebars');
            throw { status: 400, message: 'Account not verified yet, check your email for OTP!' };
        }

        // Check current_token validity synchronously (jwt.verify returns payload or throws)
        let tokenValid = false;
        if (user.current_token) {
            try {
                jwt.verify(user.current_token, process.env.JWT_SECRET);
                tokenValid = true;
            } catch (err) {
                console.error(err);
                tokenValid = false;
            }
        }

        if (tokenValid && !confirmLogin) {
            // already logged in somewhere else
            throw { status: 401, message: 'Already logged in. Log out from other device or confirm login.', code: 'CONFIRM_ERR' };
        }

        // issue new token and return user object
        const updatedUserObj = await updateUserToken(user);
        if (!updatedUserObj) throw { status: 500, message: 'Could not log you in, try again later!' };

        // Invalidate current user caches so other consumers see changes
        await cacheManager.invalidatePattern(`usr:current:${user._id}`);
        res.status(200).json(updatedUserObj);
    } catch (err) {
        handleError(res, err);
    }
};

exports.logout = async (req, res) => {
    try {
        const userId = req.body.userId;
        if (!userId) throw { status: 400, message: 'userId required' };
        const { User } = await getModels('users');

        const loggedOutUser = await User.findByIdAndUpdate(
            userId,
            { $set: { current_token: null } },
            { new: true }
        );

        if (!loggedOutUser) throw { status: 404, message: 'User not found' };

        await cacheManager.invalidatePattern(`usr:current:${userId}`);
        res.status(200).json(safeUserForResponse(loggedOutUser.toObject()));
    } catch (err) {
        handleError(res, err);
    }
};

exports.register = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) throw { status: 400, message: 'Please fill all fields' };
        if (!isValidEmail(email)) throw { status: 400, message: 'Please provide a valid email' };

        const { User } = await getModels('users');
        const existing = await User.findOne({ email });

        const hash = await hashPassword(password);
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = Date.now() + (10 * 60 * 1000); // 10 minutes TTL

        if (existing && existing.verified === true) {
            throw { status: 400, message: 'User already exists, login instead!' };
        }

        // If user exists but not verified -> update fields and send OTP once
        if (existing) {
            await User.findByIdAndUpdate(existing._id, { name, password: hash, otp, otpExpires }, { new: true });
            await sendEmail(email, 'One Time Password (OTP) verification for Quiz Blog account', { name, otp }, './template/otp.handlebars');
            await cacheManager.invalidatePattern('usr:*');
            return res.status(200).json({ message: 'Verification OTP sent to your email' });
        }

        // New user flow
        const newUser = new User({ name, email, password: hash, otp, otpExpires, verified: false });
        const saved = await newUser.save();
        if (!saved) throw { status: 500, message: 'Could not save user, try again' };

        await sendEmail(email, 'One Time Password (OTP) verification for Quiz Blog account', { name, otp }, './template/otp.handlebars');
        await cacheManager.invalidatePattern('usr:*');

        // Respond with safe info only (don't return password or otp)
        res.status(201).json({ message: 'User created. Verification OTP sent to your email', user: safeUserForResponse(saved.toObject()) });
    } catch (err) {
        handleError(res, err);
    }
};

exports.verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        if (!email || !otp) throw { status: 400, message: 'Email and OTP are required' };

        const { User } = await getModels('users');
        const usr = await User.findOne({ email });
        if (!usr) throw { status: 400, message: 'User does not exist' };
        if (!usr.otp || !usr.otpExpires || Date.now() > usr.otpExpires) {
            throw { status: 400, message: 'OTP expired. Request a new one.' };
        }
        if (String(otp) !== String(usr.otp)) throw { status: 400, message: 'Invalid OTP' };

        // mark as verified and issue token
        await User.findByIdAndUpdate(usr._id, { verified: true, otp: null, otpExpires: null });
        const updatedUser = await updateUserToken(usr); // uses your helper
        if (!updatedUser) throw { status: 500, message: 'Could not verify user' };

        await cacheManager.invalidatePattern('usr:*');

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
        handleError(res, err);
    }
};

exports.sendResetLink = async (req, res) => {
    try {
        const email = req.body.email;
        if (!email) throw { status: 400, message: 'Email is required' };

        const { User, PswdResetToken } = await getModels('users');
        const userToReset = await User.findOne({ email });
        if (!userToReset) throw { status: 404, message: 'User with that email does not exist' };

        // remove existing token for user
        let existing = await PswdResetToken.findOne({ userId: userToReset._id });
        if (existing) await existing.deleteOne();

        // Generate a secure token and store its hash (sha256)
        const resetToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

        await new PswdResetToken({
            userId: userToReset._id,
            token: tokenHash,
            register_date: Date.now()
        }).save();

        const clientURL = req.headers.origin || process.env.CLIENT_URL || process.env.LOCAL_DOMAIN_URL;
        const link = `${clientURL}/reset-password?token=${resetToken}&id=${userToReset._id}`;

        await sendEmail(
            userToReset.email,
            'Password reset for your Quiz-Blog account!',
            { name: userToReset.name, link },
            './template/requestResetPassword.handlebars'
        );

        res.status(200).json({ message: 'Reset email sent successfully' });
    } catch (err) {
        handleError(res, err);
    }
};

exports.sendNewPassword = async (req, res) => {
    try {
        const { userId, token, password } = req.body;
        if (!userId || !token || !password) throw { status: 400, message: 'Missing parameters' };

        const { User, PswdResetToken } = await getModels('users');

        const tokenDoc = await PswdResetToken.findOne({ userId });
        if (!tokenDoc) throw { status: 400, message: 'Invalid or expired link' };

        // compare token by hashing provided token and comparing with stored hash
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        if (tokenHash !== tokenDoc.token) throw { status: 400, message: 'Invalid link' };

        const hashed = await hashPassword(password);
        await User.updateOne({ _id: userId }, { $set: { password: hashed } });

        const resetUser = await User.findById(userId).select('name email');
        if (resetUser) {
            // notify
            sendEmail(
                resetUser.email,
                'Password reset for your Quiz-Blog account is successful!',
                { name: resetUser.name },
                './template/resetPassword.handlebars'
            );
        }

        await tokenDoc.deleteOne();
        await cacheManager.invalidatePattern('usr:*'); // user's cached data might be stale
        res.status(200).json({ message: 'Password reset successful' });
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateProfileImage = async (req, res) => {
    try {
        if (!req.file) throw { status: 400, message: 'Profile image is required' };
        const imgFile = req.file;
        const userId = req.params.id;

        const { User } = await getModels('users');
        const user = await User.findById(userId);
        if (!user) throw { status: 404, message: 'User not found' };

        if (user.image) {
            try {
                await deleteImageFromS3(user.image);
            } catch (err) {
                // log but don't fail entire request because S3 deletion might not be critical
                console.warn('S3 deletion failed', err.message || err);
            }
        }

        const updatedUser = await User.findByIdAndUpdate(userId, { image: imgFile.location }, { new: true }).lean();
        await expandSchoolData(updatedUser);

        await invalidateAllUserCaches();
        res.status(200).json(safeUserForResponse(updatedUser));
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const userId = req.params.id;
        const { User } = await getModels('users');

        // whitelist profile fields users can update themselves
        const allowed = ['name', 'image', 'school', 'faculty', 'level', 'interests', 'about'];
        const updates = {};
        for (const k of allowed) {
            if (req.body[k] !== undefined) updates[k] = req.body[k];
        }

        if (Object.keys(updates).length === 0) throw { status: 400, message: 'No valid fields to update' };

        let user = await User.findByIdAndUpdate(userId, updates, { new: true }).lean();
        if (!user) throw { status: 404, message: 'User not found' };
        await expandSchoolData(user);

        await invalidateAllUserCaches();
        res.status(200).json(safeUserForResponse(user));
    } catch (err) {
        handleError(res, err);
    }
};

exports.updateUser = async (req, res) => {
    try {
        // admin-level update: allow role change only if requester is admin/superadmin
        const userId = req.params.id;
        const { User } = await getModels('users');

        // build update object carefully
        const adminAllowed = ['role', 'name', 'image', 'school', 'faculty', 'level', 'interests', 'about', 'verified'];
        const updates = {};
        for (const k of adminAllowed) {
            if (req.body[k] !== undefined) updates[k] = req.body[k];
        }

        // role/verified modification safety
        if (('role' in updates || 'verified' in updates) && !(req.user && ['Admin', 'SuperAdmin'].includes(req.user.role))) {
            throw { status: 403, message: 'Insufficient permissions to change role/verified' };
        }

        const user = await User.findByIdAndUpdate(userId, updates, { new: true }).lean();
        if (!user) throw { status: 404, message: 'User not found' };

        await invalidateAllUserCaches();
        res.status(200).json(safeUserForResponse(user));
    } catch (err) {
        handleError(res, err);
    }
};

exports.deleteUser = async (req, res) => {
    try {
        const userId = req.params.id;
        const { User } = await getModels('users');
        const user = await User.findById(userId);
        if (!user) throw { status: 404, message: 'User not found' };

        // remove DB doc
        const removed = await User.deleteOne({ _id: userId });
        if (!removed || removed.deletedCount === 0) throw { status: 500, message: 'Failed to delete user' };

        // attempt to remove profile image if any
        if (user.image) {
            try {
                await deleteImageFromS3(user.image);
            } catch (err) {
                console.warn('S3 deletion failed', err.message || err);
            }
        }

        await invalidateAllUserCaches();
        res.status(200).json(safeUserForResponse(user.toObject ? user.toObject() : user));
    } catch (err) {
        handleError(res, err);
    }
};
