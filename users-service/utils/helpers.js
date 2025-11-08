const axios = require('axios');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { S3 } = require('@aws-sdk/client-s3');
const User = require('../models/User');
const { sendEmail } = require('../utils/emails/sendEmail');

// Configure S3
const s3Config = new S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    Bucket: process.env.S3_BUCKET,
    region: process.env.AWS_REGION,
});

// Helper function to call other services
const getFromService = async (url, timeout = 20000, token) => {

    if (!url || typeof url !== 'string' || url.startsWith('undefined')) return null;

    try {
        const response = await axios.get(url, {
            timeout, // 20 seconds default timeout for normal requests, longer for long running tasks
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token
            }
        });
        return response.data;
    } catch (err) {
        throw err;
    }
};

// Helper functions
const generateToken = (user) => {
    return jwt.sign({ _id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '2h' });
};

const updateUserToken = async (user) => {
    const token = generateToken(user);
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

// Expand user details
const populateOneSchool = async (user) => {

    if (!user) return null;

    try {
        let userObj = user.toObject ? user.toObject() : user;

        if (user.school && user.level && user.faculty) {
            const faculty = await getFromService(`${process.env.SCHOOLS_SERVICE_URL}/api/faculties/${user.faculty}`);
            userObj.faculty = { _id: faculty?._id, title: faculty?.title };
            userObj.level = { _id: faculty?.level?._id, title: faculty?.level?.title };
            userObj.school = { _id: faculty?.school?._id, title: faculty?.school?.title };
        }
        return userObj;
    } catch (error) {
        return userObj;
    }
};

// Generalized helper function to validate required fields
const validateRequiredFields = (fields) => {
    for (const field of fields) {
        if (!field.value) {
            throw { 'message': `Missing required field: ${field.name}`, 'status': 400 };
        }
    }
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

// Helper function to delete image from S3
const deleteImageFromS3 = async (imagePath) => {
    try {
        const deleteParams = {
            Bucket: process.env.S3_BUCKET,
            Key: imagePath.split('/').pop()
        };
        s3Config.deleteObject(deleteParams, function (err, data) {
            if (err) {
                console.error('Error deleting object:', err.message);
            } else {
                console.log('Deleted Object:', data);
            }
        });
    } catch (err) {
        throw { 'message': `Error deleting image: ${err.message}`, 'status': 500 };
    }
};

module.exports = {
    getFromService,
    populateOneSchool,
    s3Config,
    generateToken,
    updateUserToken,
    sendOtpEmail,
    hashPassword,
    validateRequiredFields,
    sendSubscriptionEmail,
    deleteImageFromS3,
};
