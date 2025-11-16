const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const EmailOtp = require('../models/EmailOtp');
const PhoneOtp = require('../models/PhoneOtp');
const User = require('../models/Users');
const { sendOtpEmail } = require('../config/emailConfig');
const { sendSmsOtp } = require('../utils/smsService');

exports.requestOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    // generate 6-digit numeric OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // upsert OTP record
    await EmailOtp.findOneAndUpdate(
      { email },
      { otpHash, expiresAt },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // send email (may throw)
    await sendOtpEmail(email, otp);

    return res.json({ success: true, message: 'OTP sent' });
  } catch (err) {
    console.error('requestOtp error', err);
    return res.status(500).json({ success: false, message: 'Failed to send OTP' });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: 'Email and OTP required' });

    const record = await EmailOtp.findOne({ email });
    if (!record) return res.status(400).json({ message: 'No OTP requested for this email' });
    if (record.expiresAt < new Date()) {
      await EmailOtp.deleteOne({ email });
      return res.status(400).json({ message: 'OTP expired' });
    }

    const match = await bcrypt.compare(otp, record.otpHash);
    if (!match) return res.status(400).json({ message: 'Invalid OTP' });

    // valid: delete OTP and respond success
    await EmailOtp.deleteOne({ email });
    return res.json({ success: true, message: 'Email verified' });
  } catch (err) {
    console.error('verifyOtp error', err);
    return res.status(500).json({ success: false, message: 'OTP verification failed' });
  }
};

// Request SMS OTP
exports.requestSmsOtp = async (req, res) => {
  try {
    let { phone } = req.body;
    
    console.log('=== SMS OTP Request ===');
    console.log('Received phone:', phone);
    
    if (!phone) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

    // Normalize phone to international format
    phone = String(phone).trim();
    if (!phone.startsWith('+')) {
      // Assume Philippines and prepend +63
      phone = phone.startsWith('0') ? '+63' + phone.slice(1) : '+63' + phone;
    }

    console.log('Normalized phone:', phone);

    // Basic validation for Philippine numbers
    if (!/^\+63[0-9]{10}$/.test(phone)) {
      return res.status(400).json({ 
        message: 'Invalid Philippine phone number. Use format: +639XXXXXXXXX or 09XXXXXXXXX' 
      });
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    console.log('Generated OTP:', otp); // Debug - REMOVE IN PRODUCTION
    
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP to database
    console.log('Saving OTP to database...');
    const savedOtp = await PhoneOtp.findOneAndUpdate(
      { phone },
      { otpHash, expiresAt, failedAttempts: 0 },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log('OTP saved:', savedOtp._id);

    // Send SMS
    console.log('Attempting to send SMS...');
    try {
      const result = await sendSmsOtp(phone, otp);
      console.log('SMS sent successfully:', result);
      return res.json({ 
        success: true, 
        message: 'OTP sent to your phone' 
      });
    } catch (sendError) {
      // Cleanup on send failure
      console.error('SMS send failed, cleaning up OTP record');
      await PhoneOtp.deleteOne({ phone }).catch(() => {});
      console.error('SMS send error:', sendError.message);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to send SMS: ' + sendError.message 
      });
    }
  } catch (err) {
    console.error('=== requestSmsOtp ERROR ===');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    console.error('Stack trace:', err.stack);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error: ' + err.message 
    });
  }
};

// Verify SMS OTP
exports.verifySmsOtp = async (req, res) => {
  try {
    let { phone, otp } = req.body;
    
    console.log('=== Verify SMS OTP ===');
    console.log('Phone:', phone);
    console.log('OTP:', otp);
    
    if (!phone || !otp) {
      return res.status(400).json({ message: 'Phone and OTP are required' });
    }

    // Normalize phone
    phone = String(phone).trim();
    if (!phone.startsWith('+')) {
      phone = phone.startsWith('0') ? '+63' + phone.slice(1) : '+63' + phone;
    }

    otp = String(otp).trim();

    const record = await PhoneOtp.findOne({ phone });
    if (!record) {
      console.log('No OTP record found for phone:', phone);
      return res.status(400).json({ 
        message: 'No OTP requested for this phone number' 
      });
    }

    // Check expiry
    if (new Date(record.expiresAt) < new Date()) {
      console.log('OTP expired');
      await PhoneOtp.deleteOne({ phone });
      return res.status(400).json({ message: 'OTP expired' });
    }

    // Check failed attempts
    if (record.failedAttempts >= 5) {
      console.log('Too many failed attempts');
      await PhoneOtp.deleteOne({ phone });
      return res.status(429).json({ 
        message: 'Too many failed attempts. Please request a new OTP.' 
      });
    }

    // Verify OTP
    const match = await bcrypt.compare(otp, record.otpHash);
    console.log('OTP match:', match);
    
    if (!match) {
      await PhoneOtp.findOneAndUpdate(
        { phone }, 
        { $inc: { failedAttempts: 1 } }
      );
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // Success - delete OTP record
    await PhoneOtp.deleteOne({ phone });

    // Update user's contactVerified if authenticated
    if (req.user?.userId) {
      console.log('Updating user contactVerified for userId:', req.user.userId);
      const updated = await User.findByIdAndUpdate(
        req.user.userId, 
        { 
          contactVerified: true,
          contact: phone 
        },
        { new: true }
      );
      console.log('User updated:', updated?._id);
    }

    return res.json({ 
      success: true, 
      message: 'Phone number verified successfully' 
    });
  } catch (err) {
    console.error('=== verifySmsOtp ERROR ===');
    console.error('Error:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Verification failed: ' + err.message 
    });
  }
};