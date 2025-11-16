const mongoose = require('mongoose');

const PhoneOtpSchema = new mongoose.Schema({
  phone: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  otpHash: { 
    type: String, 
    required: true 
  },
  expiresAt: { 
    type: Date, 
    required: true, 
    index: true 
  },
  failedAttempts: { 
    type: Number, 
    default: 0 
  },
}, { timestamps: true });

// TTL index to auto-delete expired OTPs
PhoneOtpSchema.index({ expireAfterSeconds: 0 });

module.exports = mongoose.model('PhoneOtp', PhoneOtpSchema);