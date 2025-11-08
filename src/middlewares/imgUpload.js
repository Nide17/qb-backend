const multer = require('multer');
const multerS3 = require('multer-s3');
const { s3Config } = require('../helpers');

// File Filter for multer to check if the file is an image
const fileFilter = (req, file, callback) => {
    const allowedFileTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/svg'];

    if (allowedFileTypes.includes(file.mimetype)) {
        callback(null, true);
    } else {
        console.log('File type not allowed:', file.mimetype);
        callback(null, false);
    }
};

// Uploading image to aws
const multerS3Config = multerS3({
    s3: s3Config,
    bucket: process.env.S3_BUCKET,
    metadata: (req, file, callback) => {
        callback(null, { fieldName: file.fieldname });
    },
    key: (req, file, callback) => {
        const folderName = 'imageUploads/';
        const fileName = file.originalname.toLowerCase().split(' ').join('-').replace(/[^a-zA-Z0-9.]/g, '-');
        callback(null, folderName + (req.params?.id ? req.params.id + 'qb-' : '') + fileName);
    }
});

// Multer Configuration for uploading image on AWS S3 or locally
const upload = multer({
    storage: multerS3Config,
    fileFilter: fileFilter,
    limits: {
        fileSize: 2000000 // 1000000 Bytes = 1 MB (2MB)
    }
});

exports.imgUpload = upload;