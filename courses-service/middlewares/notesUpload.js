const { S3 } = require("@aws-sdk/client-s3")
const path = require('path')
const multer = require('multer')
const multerS3 = require('multer-s3')

// AWS S3 Configuration
const s3Config = new S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    Bucket: process.env.S3_BUCKET,
    region: process.env.AWS_REGION
})

// File Filter for multer to check if the file is an image
const fileFilter = (req, file, callback) => {

    const allowedFileTypes = ['application/pdf', 'application/x-pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']

    if (allowedFileTypes.includes(file.mimetype)) {
        callback(null, true)
    } else {
        callback(null, false)
    }
}

// Uploading file locally if multer is working.
const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, path.join(__dirname, 'notes'));
    },
    filename: (req, file, callback) => {
        const fileName = file.originalname.toUpperCase().split(' ').join('-').replace(/[^a-zA-Z0-9.]/g, '-')
        callback(null, fileName.replace(/\./g, '-[Shared by Quiz-Blog].'))
    }
})

// Uploading file to aws
const multerS3Config = multerS3({
    s3: s3Config,
    bucket: process.env.S3_BUCKET,
    metadata: (req, file, callback) => {
        callback(null, { fieldName: file.fieldname })
    },
    key: (req, file, callback) => {
        const folderName = 'notes/';
        const fileName = file.originalname.toUpperCase().split(' ').join('-').replace(/[^a-zA-Z0-9.]/g, '-')
        callback(null, folderName + fileName.replace(/\./g, '-[Shared by Quiz-Blog].'))
    }
})

// Multer Configuration for uploading file on AWS S3 or locally
const upload = multer({
    storage: multerS3Config,
    fileFilter: fileFilter,
    limits: {
        fileSize: 50000000 // 1000000 Bytes = 1 MB (50MB)
    }
})

exports.notesUpload = upload
