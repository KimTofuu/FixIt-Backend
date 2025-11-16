const mongoose = require('mongoose');

const EmailOtpSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, index: true },
  otpHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

module.exports = mongoose.model('EmailOtp', EmailOtpSchema);