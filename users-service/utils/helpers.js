const axios = require('axios');
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { S3 } = require("@aws-sdk/client-s3")
const User = require("../models/User")
const { sendEmail } = require("../utils/emails/sendEmail")

// Configure S3
const s3Config = new S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    Bucket: process.env.S3_BUCKET,
    region: process.env.AWS_REGION,
})

// Helper function to call other services
const callService = async (url, timeout = 20000, token) => {

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
        console.warn(`\n\nService call failed for URL: ${url}\nError:`, err.name, err.message);
        return null;
    }
};

// Helper functions
const generateToken = (user) => {
    return jwt.sign({ _id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '2h' })
}

const updateUserToken = async (user) => {
    const token = generateToken(user)
    return await User.findByIdAndUpdate({ _id: user._id }, { $set: { current_token: token } }, { new: true })
}

const sendOtpEmail = async (user, otp) => {
    await sendEmail(user.email,
        "One Time Password (OTP) verification for Quiz Blog account",
        { name: user.name, otp }, "./template/otp.handlebars")
}

const hashPassword = async (password) => {
    const salt = await bcrypt.genSalt(10)
    if (!salt) return res.status(500).json({ message: 'Something went wrong with bcrypt' })
    const hash = await bcrypt.hash(password, salt)
    if (!hash) return res.status(500).json({ message: 'Something went wrong hashing the password' })
    return hash
}

// Populate user details
const populateSchoolDetails = async (user) => {
    if (!user) return null;

    let userObj = user.toObject ? user.toObject() : user;

    try {

        // Fetch school, level, and faculty details
        if (user.school && user.level && user.faculty) {
            const faculty = await callService(`${process.env.SCHOOLS_SERVICE_URL}/api/faculties/${user.faculty}`);
            userObj.faculty = { _id: faculty?._id, title: faculty?.title };
            userObj.level = { _id: faculty?.level?._id, title: faculty?.level?.title };
            userObj.school = { _id: faculty?.school?._id, title: faculty?.school?.title };
        }
        return userObj;
    } catch (error) {
        console.log('Error populating user school details:', error.message);
        return userObj;
    }
};

// Generalized helper function to validate required fields
const validateRequiredFields = (fields) => {
    for (const field of fields) {
        if (!field.value) {
            throw new Error(`Missing required field: ${field.name}`);
        }
    }
};

// Helper function to send subscription email
const sendSubscriptionEmail = (subscriber) => {
    const clientURL = process.env.NODE_ENV === 'production' ?
        process.env.DOMAIN_URL : process.env.LOCAL_DOMAIN_URL;

    sendEmail(
        subscriber.email,
        "Thank you for subscribing to Quiz-Blog!",
        {
            name: subscriber.name,
            unsubscribeLink: `${clientURL}/unsubscribe`
        },
        "./template/subscribe.handlebars"
    );
};

const allowList = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:5000',
    'https://www.quizblog.rw',
    'https://www.quizblog.online',
]

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowList.includes(origin)) {
            callback(null, true)
        } else {
            console.log(origin + ' is not allowed by CORS')
            callback(new Error('Not allowed by CORS'))
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    preflightContinue: false,
    optionsSuccessStatus: 200,
    maxAge: 3600
}

module.exports = {
    callService,
    populateSchoolDetails,
    s3Config,
    generateToken,
    updateUserToken,
    sendOtpEmail,
    hashPassword,
    validateRequiredFields,
    sendSubscriptionEmail,
    corsOptions,
};
