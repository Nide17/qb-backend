const express = require("express")
const { getImageUploads, getImageUploadsByOwner, createImageUpload, updateImageUpload, deleteImageUpload } = require("../../controllers/blog-posts/image-uploads")
const { authRole } = require("../../middlewares/auth")
const { imgUpload } = require("../../middlewares/imgUpload")

const router = express.Router()

// GET routes
router.get("/", getImageUploads)
router.get("/image-owner/:id", getImageUploadsByOwner)

// POST routes
router.post("/", authRole(['Creator', 'Admin', 'SuperAdmin']), imgUpload.single("uploadImage"), createImageUpload)

// PUT routes
router.put("/:id", authRole(['Creator', 'Admin', 'SuperAdmin']), updateImageUpload)

// DELETE routes
router.delete("/:id", authRole(['Creator', 'Admin', 'SuperAdmin']), deleteImageUpload)

module.exports = router