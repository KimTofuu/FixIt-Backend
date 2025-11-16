require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { sendSmsOtp } = require('./utils/smsService');

(async () => {
  // Debug: Check if env vars loaded
  console.log('TERMII_API_KEY exists?', !!process.env.TERMII_API_KEY);
  console.log('TERMII_API_KEY value:', process.env.TERMII_API_KEY?.substring(0, 10) + '...');
  
  try {
    const testPhone = '+639983925959'; // Your actual number
    const testOtp = '123456';
    
    console.log(`Testing SMS send to ${testPhone}...`);
    const result = await sendSmsOtp(testPhone, testOtp);
    console.log('✅ Success:', result);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
  process.exit(0);
})();