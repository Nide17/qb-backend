
const multer = require('multer');
const multerS3 = require('multer-s3');
const { s3Config } = require('../utils/global-helpers');

// File Filter for multer to check if the file is an image
const fileFilter = (req, file, callback) => {

    const allowedFileTypes = ['application/pdf', 'application/x-pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'];

    if (allowedFileTypes.includes(file.mimetype)) {
        callback(null, true);
    } else {
        callback(null, false);
    }
};

// Uploading file to aws
const multerS3Config = multerS3({
    s3: s3Config,
    bucket: process.env.S3_BUCKET,
    metadata: (req, file, callback) => {
        callback(null, { fieldName: file.fieldname });
    },
    key: (req, file, callback) => {
        const folderName = 'notes/';
        const fileName = file.originalname.toUpperCase().split(' ').join('-').replace(/[^a-zA-Z0-9.]/g, '-');
        callback(null, folderName + fileName.replace(/\./g, '-[Shared by Quiz-Blog].'));
    }
});

// Multer Configuration for uploading file on AWS S3 or locally
const upload = multer({
    storage: multerS3Config,
    fileFilter: fileFilter,
    limits: {
        fileSize: 50000000 // 1000000 Bytes = 1 MB (50MB)
    }
});

exports.notesUpload = upload;
