const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken } = require('../middleware/authenticateToken');
const { upload } = require('../config/cloudinaryConfig'); 

// Auth routes
router.post('/register', userController.register);
router.post('/login', userController.login);
router.post('/logout', userController.logout);

// Profile routes
router.get('/me', authenticateToken, userController.getMyProfile);
router.get('/profile', authenticateToken, userController.getProfile);
router.patch('/profile', authenticateToken, userController.updateProfile);
router.patch('/change-password', authenticateToken, userController.changePassword);

router.post('/request-email-otp', userController.requestEmailOtp);
router.post('/verify-email-otp', userController.verifyEmailOtp);

router.post(
  '/me/profile-picture',
  authenticateToken,
  upload.single('profilePicture'), // This uploads to Cloudinary
  userController.uploadProfilePicture
);

router.delete('/me/profile-picture', authenticateToken, userController.deleteProfilePicture);

// Password reset
router.post('/forgot-password', userController.forgotPassword);
router.post('/reset-password', userController.resetPassword);

// SMS verification routes
router.post('/request-sms-otp', userController.requestSmsOtp);
router.post('/verify-sms-otp', authenticateToken, userController.verifySmsOtp);

// Other routes
router.get('/all', userController.getAllUsers);
router.post('/get-user', userController.getUser);

module.exports = router;