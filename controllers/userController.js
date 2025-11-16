const bcrypt = require('bcryptjs');
const User = require('../models/Users');
const jwt = require('jsonwebtoken');
const cloudinary = require("../config/cloudinary");
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const smsService = require('../config/smsService');
const { sendEmailBrevo, sendOtpEmail, generateOtp } = require('../config/emailConfig');
const SuspendedUser = require('../models/Suspended');

const emailOtpStore = new Map();
// Configure email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail', // or your email service
  auth: {
    user: process.env.MAIL_USERNAME, // your email
    pass: process.env.MAIL_PASSWORD, // your email password or app password
  },
});

// Registration
exports.register = async (req, res) => {
  try {
    const { fName, lName, email, contact, password, confirmPassword, barangay, municipality } = req.body;
    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ fName, lName, email, contact, password: hashedPassword, lastLogin: new Date(), barangay, municipality });
    await newUser.save();
    res.status(201).json({ success: true, message: 'User registered successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
    console.error(err);
  }
};

// Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists in active users
    let user = await User.findOne({ email });

    // ✅ Check if user is suspended
    if (!user) {
      const suspendedUser = await SuspendedUser.findOne({ email });
      
      if (suspendedUser) {
        return res.status(403).json({
          message: 'Your account has been suspended',
          suspended: true,
          suspensionReason: suspendedUser.suspensionReason,
          suspendedAt: suspendedUser.suspendedAt
        });
      }
      
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email,
        role: 'user' 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      userId: user._id,
      role: 'user',
      user: {
        id: user._id,
        email: user.email,
        name: `${user.fName} ${user.lName}`,
        address: user.address,
        barangay: user.barangay
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// Logout
exports.logout = (req, res) => {
  res.clearCookie('token');
  res.status(200).json({ message: 'Logout successful' });
};

// Get all users
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}, '-password');
    res.status(200).json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
    console.error(err);
  }
};

// Get user by ID
exports.getUser = async (req, res) => {
  try {
    const { id } = req.body;
    const user = await User.findById(id, '-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
    console.error(err);
  }
};

// Protected route example
exports.protected = (req, res) => {
  res.json({ message: 'This is a protected route', user: req.user });
};

// Get current logged-in user's profile
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json(user);
  } catch (err) {
    console.error('getProfile error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Update current logged-in user's profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const updates = {};
    const allowed = ['fName', 'lName', 'email', 'contact', 'barangay', 'municipality'];

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    const updated = await User.findByIdAndUpdate(
      userId, 
      updates, 
      { new: true, select: '-password' }
    );
    
    if (!updated) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.status(200).json(updated);
  } catch (err) {
    console.error('updateProfile error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Change password
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Hash and save new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    return res.status(200).json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('changePassword error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Upload/Update profile picture
exports.uploadProfilePicture = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete old profile picture from Cloudinary if exists
    if (user.profilePicture?.public_id) {
      try {
        await cloudinary.uploader.destroy(user.profilePicture.public_id);
        console.log('Old profile picture deleted:', user.profilePicture.public_id);
      } catch (err) {
        console.error('Error deleting old image:', err);
      }
    }

    // Update user with new profile picture
    user.profilePicture = {
      url: req.file.path,
      public_id: req.file.filename
    };

    await user.save();

    return res.status(200).json({
      message: 'Profile picture updated successfully',
      profilePicture: user.profilePicture
    });
  } catch (err) {
    console.error('uploadProfilePicture error:', err);
    return res.status(500).json({ message: 'Server error: ' + err.message });
  }
};

// Delete profile picture
exports.deleteProfilePicture = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Delete from Cloudinary if exists
    if (user.profilePicture?.public_id) {
      try {
        await cloudinary.uploader.destroy(user.profilePicture.public_id);
        console.log('Profile picture deleted:', user.profilePicture.public_id);
      } catch (err) {
        console.error('Error deleting image:', err);
      }
    }

    // Reset profile picture
    user.profilePicture = {
      url: '',
      public_id: ''
    };

    await user.save();

    return res.status(200).json({
      message: 'Profile picture deleted successfully'
    });
  } catch (err) {
    console.error('deleteProfilePicture error:', err);
    return res.status(500).json({ message: 'Server error: ' + err.message });
  }
};

// Forgot Password
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Don't reveal if user exists for security
      return res.status(200).json({ 
        message: 'If an account exists with that email, a password reset link has been sent.' 
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Save token to user (expires in 1 hour)
    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL}/user-resetpassword?token=${resetToken}&email=${email}`;

    // Email content
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Password Reset Request - FixIt PH',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #667eea;">Reset Your Password</h2>
          <p>Hello ${user.fName},</p>
          <p>You requested to reset your password for your FixIt PH account.</p>
          <p>Click the button below to reset your password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background: #667eea; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="color: #666; word-break: break-all;">${resetUrl}</p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            This link will expire in 1 hour. If you didn't request this, please ignore this email.
          </p>
        </div>
      `,
    };

    // Send email
    await transporter.sendMail(mailOptions);

    res.status(200).json({ 
      message: 'Password reset link has been sent to your email.' 
    });

  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
};

// Reset Password
exports.resetPassword = async (req, res) => {
  try {
    const { token, email, newPassword } = req.body;

    if (!token || !email || !newPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Hash the token to compare with stored hash
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid token
    const user = await User.findOne({
      email: email.toLowerCase(),
      resetPasswordToken: resetTokenHash,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ 
        message: 'Invalid or expired reset token' 
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear reset token
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({ 
      message: 'Password has been reset successfully. You can now log in.' 
    });

  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ message: 'Server error. Please try again later.' });
  }
};

exports.getMyProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Convert mongoose document to a plain object to safely modify it
    const userObject = user.toObject();

    if (userObject.profilePicture && userObject.profilePicture.url && !userObject.profilePicture.url.startsWith('http')) {
      console.warn(`User ${user._id} has an invalid local file path for profile picture. Clearing it.`);
      userObject.profilePicture = null;
    }

    res.json(userObject);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Request SMS OTP
exports.requestSmsOtp = async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

    // Validate phone number format (basic validation)
    const phoneRegex = /^(\+63|0)?9\d{9}$/;
    if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
      return res.status(400).json({ 
        message: 'Invalid Philippine phone number format. Use +639XXXXXXXXX or 09XXXXXXXXX' 
      });
    }

    const result = await smsService.sendOTP(phone);

    if (result.success) {
      console.log(`✅ OTP sent to ${phone}`);
      res.json({ 
        message: 'Verification code sent to your phone',
        messageId: result.messageId 
      });
    } else {
      res.status(500).json({ message: result.message || 'Failed to send OTP' });
    }
  } catch (error) {
    console.error('Request OTP error:', error);
    res.status(500).json({ 
      message: error.message || 'Failed to send verification code' 
    });
  }
};

// Verify SMS OTP
exports.verifySmsOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    const userId = req.user.userId;

    if (!phone || !otp) {
      return res.status(400).json({ message: 'Phone number and OTP are required' });
    }

    const result = smsService.verifyOTP(phone, otp);

    if (result.success) {
      // Update user's contact verification status
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      user.contact = phone;
      user.contactVerified = true;
      await user.save();

      console.log(`✅ Phone verified for user ${userId}: ${phone}`);
      
      res.json({ 
        message: 'Phone number verified successfully',
        contactVerified: true 
      });
    } else {
      res.status(400).json({ message: result.message });
    }
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ message: 'Verification failed' });
  }
};

// ✅ Request Email OTP
exports.requestEmailOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Check if email already exists (optional - depends on your use case)
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Generate 6-digit OTP
    const otp = generateOtp();
    
    // Store OTP with expiration (5 minutes)
    emailOtpStore.set(email, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      attempts: 0,
      createdAt: Date.now()
    });

    // Send OTP via email
    await sendOtpEmail(email, otp);

    console.log(`✅ Email OTP sent to ${email}:`, otp); // Remove in production

    res.status(200).json({ 
      success: true,
      message: 'OTP sent successfully to your email',
      expiresIn: 300 // seconds
    });

  } catch (error) {
    console.error('❌ Request Email OTP error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to send OTP. Please try again.',
      error: error.message 
    });
  }
};

// ✅ Verify Email OTP
exports.verifyEmailOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and OTP are required' 
      });
    }

    const storedData = emailOtpStore.get(email);

    if (!storedData) {
      return res.status(400).json({ 
        success: false,
        message: 'OTP not found or expired. Please request a new one.' 
      });
    }

    // Check if OTP has expired
    if (Date.now() > storedData.expiresAt) {
      emailOtpStore.delete(email);
      return res.status(400).json({ 
        success: false,
        message: 'OTP has expired. Please request a new one.' 
      });
    }

    // Check attempts (max 3 attempts)
    if (storedData.attempts >= 3) {
      emailOtpStore.delete(email);
      return res.status(429).json({ 
        success: false,
        message: 'Too many failed attempts. Please request a new OTP.' 
      });
    }

    // Verify OTP
    if (storedData.otp !== otp.trim()) {
      storedData.attempts++;
      return res.status(400).json({ 
        success: false,
        message: 'Invalid OTP. Please try again.',
        attemptsRemaining: 3 - storedData.attempts
      });
    }

    // OTP is valid, remove it from store
    emailOtpStore.delete(email);

    console.log(`✅ Email OTP verified for ${email}`);

    res.status(200).json({ 
      success: true,
      message: 'Email verified successfully. You can now complete registration.' 
    });

  } catch (error) {
    console.error('❌ Verify Email OTP error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to verify OTP. Please try again.',
      error: error.message 
    });
  }
};

// ✅ Optional: Resend Email OTP
exports.resendEmailOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Check if there's an existing OTP
    const existingData = emailOtpStore.get(email);
    
    // Prevent spam: Only allow resend after 1 minute
    if (existingData && (Date.now() - existingData.createdAt) < 60000) {
      return res.status(429).json({ 
        success: false,
        message: 'Please wait before requesting a new OTP',
        retryAfter: Math.ceil((60000 - (Date.now() - existingData.createdAt)) / 1000)
      });
    }

    // Generate new OTP
    const otp = generateOtp();
    
    // Store new OTP
    emailOtpStore.set(email, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
      createdAt: Date.now()
    });

    // Send OTP via email
    await sendOtpEmail(email, otp);

    console.log(`✅ Email OTP resent to ${email}:`, otp);

    res.status(200).json({ 
      success: true,
      message: 'New OTP sent successfully',
      expiresIn: 300
    });

  } catch (error) {
    console.error('❌ Resend Email OTP error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to resend OTP',
      error: error.message 
    });
  }
};