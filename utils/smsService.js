require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');

const TERMII_API_KEY = process.env.TERMII_API_KEY;
const TERMII_SENDER_ID = process.env.TERMII_SENDER_ID || 'N-Alert';
const NODE_ENV = process.env.NODE_ENV || 'development';
const USE_MOCK_SMS = process.env.USE_MOCK_SMS === 'true' || NODE_ENV === 'development';

console.log('SMS Service initialized');
console.log('Environment:', NODE_ENV);
console.log('Mock SMS enabled:', USE_MOCK_SMS);

const sendSmsOtp = async (phone, otp) => {
  // Development mode - just log the OTP (no real SMS)
  if (USE_MOCK_SMS) {
    console.log('\n' + '='.repeat(60));
    console.log('📱 MOCK SMS - DEVELOPMENT MODE');
    console.log('='.repeat(60));
    console.log('To:', phone);
    console.log('OTP Code:', otp);
    console.log('Message: Your FixItPH verification code is ' + otp);
    console.log('Expires: 10 minutes');
    console.log('='.repeat(60) + '\n');
    
    // Simulate a small delay like a real API
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return { 
      success: true, 
      mock: true,
      message_id: 'mock-' + Date.now(),
      message: 'SMS mocked in development mode',
      status: 'sent'
    };
  }

  // Production mode - send real SMS via Termii
  if (!TERMII_API_KEY) {
    throw new Error('Termii API key not configured');
  }

  try {
    console.log('Sending SMS via Termii...');
    console.log('To:', phone);
    
    const response = await axios.post('https://api.ng.termii.com/api/sms/send', {
      to: phone,
      from: TERMII_SENDER_ID,
      sms: `Your FixItPH verification code is ${otp}. It expires in 10 minutes.`,
      type: 'plain',
      channel: 'generic',
      api_key: TERMII_API_KEY
    });

    console.log('SMS sent via Termii:', response.data);
    return response.data;
  } catch (error) {
    console.error('Termii send error:', error.response?.data || error.message);
    throw error;
  }
};

module.exports = { sendSmsOtp };