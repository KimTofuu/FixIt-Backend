// require('dotenv').config();
// const nodemailer = require('nodemailer');

// const transporter = nodemailer.createTransport({
//   service: 'gmail',
//   auth: {
//     user: process.env.MAIL_USERNAME,
//     pass: process.env.MAIL_PASSWORD,
//   },
// });

// transporter.verify((err, success) => {
//   if (err) {
//     console.error('Nodemailer verify error:', err);
//   } else {
//     console.log('Nodemailer transporter ready');
//   }
// });

// /**
//  * A generic email sending function.
//  * @param {object} options - Email options.
//  * @param {string} options.to - Recipient's email address.
//  * @param {string} options.subject - Email subject.
//  * @param {string} options.html - Email body in HTML format.
//  */
// const sendEmail = async (options) => {
//   const mailOptions = {
//     from: `"FixItPH Support" <${process.env.MAIL_USERNAME}>`, // Using a sender name
//     to: options.to,
//     subject: options.subject,
//     html: options.html,
//   };
//   return transporter.sendMail(mailOptions);
// };

// const sendOtpEmail = async (email, otp) => {
//   const subject = 'Your FixItPH verification code';
//   const html = `<p>Your verification code is <strong>${otp}</strong>. It expires in 10 minutes.</p>`;
  
//   return sendEmail({ to: email, subject, html });
// };

// const generateOtp = () => {
//   return Math.floor(100000 + Math.random() * 900000).toString();
// };

// module.exports = { 
//   sendOtpEmail,
//   sendEmail, // Export the new generic function
//   generateOtp
// };