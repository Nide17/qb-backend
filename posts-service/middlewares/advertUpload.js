const { S3 } = require('@aws-sdk/client-s3');
const multer = require('multer');
const multerS3 = require('multer-s3');

// AWS S3 Configuration
const s3Config = new S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    Bucket: process.env.S3_BUCKET,
    region: process.env.AWS_REGION,
});

// Uploading image to aws
const multerS3Config = multerS3({
    s3: s3Config,
    bucket: process.env.S3_BUCKET,
    metadata: (req, file, callback) => {
        callback(null, { fieldName: file.fieldname });
    },
    key: (req, file, callback) => {
        // Include the desired folder structure as part of the object key
        const folderName = 'adverts/'; // This simulates a folder structure within the bucket
        const fileName = file.originalname.toLowerCase().split(' ').join('-').replace(/[^a-zA-Z0-9.]/g, '-');
        callback(null, folderName + req.params.id + '-' + fileName);
    }
});

// File Filter for multer to check if the file is an image
const fileFilter = (req, file, callback) => {
    const allowedFileTypes = ['image/jpeg', 'image/png', 'image/svg'];

    if (allowedFileTypes.includes(file.mimetype)) {
        callback(null, true);
    } else {
        callback(null, false);
    }
};

// Multer Configuration for uploading image on AWS S3 or locally
const upload = multer({
    // storage: storage,
    storage: multerS3Config,
    fileFilter: fileFilter,
    limits: {
        fileSize: 2000000 // 1000000 Bytes = 1 MB (2MB)
    }
});

exports.advertUpload = upload;