const axios = require('axios');

// Store OTPs temporarily (in production, use Redis or database)
const otpStore = new Map();

// Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Format phone number for ClickSend (requires international format)
const formatPhoneNumber = (phone) => {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '');
  
  // If it starts with 0, replace with +63 (Philippines)
  if (cleaned.startsWith('0')) {
    cleaned = '63' + cleaned.slice(1);
  }
  
  // If it doesn't start with country code, add +63
  if (!cleaned.startsWith('63')) {
    cleaned = '63' + cleaned;
  }
  
  return '+' + cleaned;
};

// Send OTP via SMS using ClickSend REST API
exports.sendOTP = async (phoneNumber) => {
  try {
    const otp = generateOTP();
    const formattedPhone = formatPhoneNumber(phoneNumber);
    
    console.log(`📱 Sending OTP ${otp} to ${formattedPhone}`);
    
    // Create Basic Auth header
    const auth = Buffer.from(
      `${process.env.CLICKSEND_USERNAME}:${process.env.CLICKSEND_API_KEY}`
    ).toString('base64');
    
    // Send SMS via ClickSend API
    const response = await axios.post(
      'https://rest.clicksend.com/v3/sms/send',
      {
        messages: [
          {
            source: 'sdk',
            from: 'FixItPH',
            to: formattedPhone,
            body: `Your FixIt PH verification code is: ${otp}. Valid for 5 minutes. Do not share this code.`,
          },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`,
        },
      }
    );
    
    console.log('✅ ClickSend Response:', response.data);
    
    if (response.data.response_code === 'SUCCESS') {
      // Store OTP with 5-minute expiration
      otpStore.set(formattedPhone, {
        otp,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
        attempts: 0, // Track verification attempts
      });
      
      console.log('✅ OTP sent successfully');
      
      return {
        success: true,
        message: 'OTP sent successfully',
        messageId: response.data.data?.messages?.[0]?.message_id || 'unknown',
        cost: response.data.data?.messages?.[0]?.cost || 0,
      };
    } else {
      throw new Error(response.data.response_msg || 'Failed to send SMS');
    }
  } catch (error) {
    console.error('❌ ClickSend SMS error:', error.response?.data || error.message);
    
    // Handle specific errors
    if (error.response?.status === 401) {
      throw new Error('Invalid ClickSend credentials. Please check your username and API key.');
    } else if (error.response?.status === 400) {
      throw new Error('Invalid phone number format.');
    } else if (error.response?.data?.response_msg) {
      throw new Error(error.response.data.response_msg);
    }
    
    throw new Error(error.message || 'Failed to send OTP');
  }
};

// Verify OTP
exports.verifyOTP = (phoneNumber, enteredOTP) => {
  const formattedPhone = formatPhoneNumber(phoneNumber);
  const stored = otpStore.get(formattedPhone);
  
  if (!stored) {
    return {
      success: false,
      message: 'OTP not found or expired. Please request a new code.',
    };
  }
  
  // Check if OTP expired
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(formattedPhone);
    return {
      success: false,
      message: 'OTP expired. Please request a new code.',
    };
  }
  
  // Increment attempts
  stored.attempts += 1;
  
  // Max 5 attempts
  if (stored.attempts > 5) {
    otpStore.delete(formattedPhone);
    return {
      success: false,
      message: 'Too many failed attempts. Please request a new code.',
    };
  }
  
  // Check if OTP matches
  if (stored.otp !== enteredOTP) {
    return {
      success: false,
      message: `Invalid OTP. ${5 - stored.attempts} attempts remaining.`,
    };
  }
  
  // OTP is valid, remove it from store
  otpStore.delete(formattedPhone);
  
  return {
    success: true,
    message: 'Phone number verified successfully',
  };
};

// Get OTP info (for debugging)
exports.getOTPInfo = (phoneNumber) => {
  const formattedPhone = formatPhoneNumber(phoneNumber);
  const stored = otpStore.get(formattedPhone);
  
  if (!stored) {
    return null;
  }
  
  return {
    expiresIn: Math.max(0, stored.expiresAt - Date.now()),
    attempts: stored.attempts,
  };
};

// Clean up expired OTPs (run periodically)
setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [phone, data] of otpStore.entries()) {
    if (now > data.expiresAt) {
      otpStore.delete(phone);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} expired OTP(s)`);
  }
}, 60 * 1000); // Run every minute

module.exports = exports;