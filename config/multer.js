const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("./cloudinary");

// Storage for profile pictures
const profilePictureStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "fixit-profile-pictures",
    allowed_formats: ["jpg", "png", "jpeg", "webp", "gif"],
    transformation: [
      { width: 400, height: 400, crop: 'fill', gravity: 'face' }
    ]
  },
});

// Storage for report images (existing)
const reportImageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "profile_pictures",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

// Multer for profile pictures
const uploadProfilePicture = multer({ 
  storage: profilePictureStorage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Multer for reports (existing)
const upload = multer({ storage: reportImageStorage });

module.exports = {
  upload,
  uploadProfilePicture
};
