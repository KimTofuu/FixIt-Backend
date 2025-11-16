// const formData = require('form-data');
// const Mailgun = require('mailgun.js');
const crypto = require('crypto');
const brevo = require('@getbrevo/brevo');

// const mailgun = new Mailgun(formData);

// // Initialize Mailgun client
// const mg = mailgun.client({
//   username: 'api',
//   key: process.env.MAILGUN_API_KEY,
//   url: process.env.MAILGUN_API_URL || 'https://api.mailgun.net', // Use EU url if needed
// });

// Initialize Brevo API client
let apiInstance = new brevo.TransactionalEmailsApi();
let apiKey = apiInstance.authentications['apiKey'];
apiKey.apiKey = process.env.BREVO_API_KEY;

// const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN;
// const FROM_EMAIL = process.env.MAILGUN_FROM_EMAIL || `noreply@${MAILGUN_DOMAIN}`;
const FROM_EMAIL_BREVO = process.env.BREVO_FROM_EMAIL || 'fixitph0@gmail.com';
const FROM_NAME_BREVO = process.env.BREVO_FROM_NAME || 'FixItPH';

const buildOtpEmail = (otp, ownerName) => `
  <!DOCTYPE html>
  <html>
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      <title>FixItPH Verification Code</title>
      <style>
        body { font-family: 'Inter', Arial, sans-serif; background: #f5f9fc; margin: 0; padding: 0; }
        .wrapper { max-width: 560px; margin: 0 auto; padding: 32px 20px; }
        .card { background: #ffffff; border-radius: 16px; box-shadow: 0 24px 56px rgba(7,18,42,0.12); padding: 32px 28px; }
        .logo { text-align: center; margin-bottom: 24px; }
        .headline { font-size: 22px; font-weight: 700; color: #111827; text-align: center; margin: 0 0 12px; }
        .lead { font-size: 15px; color: #374151; text-align: center; margin: 0 0 18px; }
        .otp { display: inline-block; background: linear-gradient(160deg, #00CCCB, #009fa0); color: #ffffff; font-size: 28px; letter-spacing: 6px; padding: 16px 32px; border-radius: 14px; font-weight: 700; }
        .cta { text-align: center; margin: 24px 0 16px; }
        .meta { font-size: 13px; color: #6b7280; line-height: 1.6; text-align: center; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="card">
          <div class="logo">
            <img src="https://res.cloudinary.com/fixitph/image/upload/v1699212345/Fix-it_logo_3.png" alt="FixItPH" width="160" height="40" style="display:inline-block;" />
          </div>
          <p class="headline">Verify your email</p>
          <p class="lead">Hi ${ownerName || 'there'}, use the code below to finish setting up your FixItPH account.</p>
          <div class="cta">
            <span class="otp">${otp}</span>
          </div>
          <p class="meta">This code expires in 5 minutes. If you didn’t request it, you can safely ignore this email.</p>
        </div>
      </div>
    </body>
  </html>
`;

/**
 * Send email using Mailgun
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML content
 */
// const sendEmailMailgun = async (to, subject, html) => {
//   try {
//     console.log(`📧 Sending email to ${to} using Mailgun...`);
    
//     const messageData = {
//       from: `FixItPH <${FROM_EMAIL}>`,
//       to: to,
//       subject: subject,
//       html: html,
//     };

//     const response = await mg.messages.create(MAILGUN_DOMAIN, messageData);
    
//     console.log('✅ Email sent successfully via Mailgun:', response.id);
//     return response;
//   } catch (error) {
//     console.error('❌ Failed to send email via Mailgun:', error);
//     throw error;
//   }
// };

/**
 * Send email using Brevo
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML content
 */
const sendEmailBrevo = async (to, subject, html) => {
  try {
    console.log(`📧 Sending email to ${to} using Brevo...`);
    
    if (!process.env.BREVO_API_KEY) {
      throw new Error('BREVO_API_KEY is not configured in environment variables');
    }

    // ✅ Create new API instance each time to ensure fresh authentication
    const apiInstance = new brevo.TransactionalEmailsApi();
    
    // ✅ Set authentication
    apiInstance.setApiKey(
      brevo.TransactionalEmailsApiApiKeys.apiKey,
      process.env.BREVO_API_KEY
    );

    let sendSmtpEmail = new brevo.SendSmtpEmail();
    
    sendSmtpEmail.sender = { name: FROM_NAME_BREVO, email: FROM_EMAIL_BREVO };
    sendSmtpEmail.to = [{ email: to }];
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = html;

    const response = await apiInstance.sendTransacEmail(sendSmtpEmail);
    
    console.log('✅ Email sent successfully via Brevo:', response.messageId);
    return response;
  } catch (error) {
    console.error('❌ Failed to send email via Brevo:', error);
    throw error;
  }
};

// Email templates
const emailTemplates = {
  verificationOTP: (otp, ownerName) => `...existing template...`,
  
  passwordReset: (resetToken, ownerName) => `...existing template...`,
  
  reportStatusUpdate: (reportTitle, newStatus, ownerName) => `...existing template...`,
  // ✅ Add this template
  reportRemoved: (ownerName, reportTitle, reason) => ({
    subject: `⚠️ Your Report Has Been Removed - ${reportTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .warning-box { background: #fff3cd; border-left: 4px solid #ff6b6b; padding: 15px; margin: 20px 0; border-radius: 5px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ Report Removed</h1>
          </div>
          <div class="content">
            <p>Hello ${ownerName},</p>
            
            <p>We're writing to inform you that your report "<strong>${reportTitle}</strong>" has been removed from FixItPH.</p>
            
            <div class="warning-box">
              <strong>Reason for removal:</strong><br>
              ${reason}
            </div>
            
            <p>If you believe this was a mistake or have questions, please contact your barangay administrator.</p>
            
            <p>Thank you for your understanding.</p>
            
            <div class="footer">
              <p>This is an automated notification from FixItPH</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  thankFlagger: (ownerName, reportTitle) => ({
    subject: `✅ Thank You for Flagging - ${reportTitle}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .success-box { background: #d4edda; border-left: 4px solid #4CAF50; padding: 15px; margin: 20px 0; border-radius: 5px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Thank You!</h1>
          </div>
          <div class="content">
            <p>Hello ${ownerName},</p>
            
            <div class="success-box">
              <strong>Action Taken:</strong><br>
              The report "<strong>${reportTitle}</strong>" that you flagged has been reviewed and removed by our administrators.
            </div>
            
            <p>Thank you for helping keep FixItPH a safe and trustworthy platform for our community!</p>
            
            <p>Your vigilance helps us maintain quality standards and ensures that all reports are legitimate.</p>
            
            <div class="footer">
              <p>This is an automated notification from FixItPH</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  userSuspended: (ownerName, reason) => ({
    subject: `🚫 Your FixItPH Account Has Been Suspended`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .warning-box { background: #fff3cd; border-left: 4px solid #ff6b6b; padding: 15px; margin: 20px 0; border-radius: 5px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚫 Account Suspended</h1>
          </div>
          <div class="content">
            <p>Hello ${ownerName},</p>
            
            <p>Your FixItPH account has been suspended by an administrator.</p>
            
            <div class="warning-box">
              <strong>Reason:</strong><br>
              ${reason || 'Violation of community guidelines'}
            </div>
            
            <p>You will not be able to access your account until it is reinstated.</p>
            
            <p>If you have questions, please contact your barangay administrator.</p>
            
            <div class="footer">
              <p>This is an automated notification from FixItPH</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  userUnsuspended: (ownerName) => ({
    subject: `✅ Your FixItPH Account Has Been Reinstated`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .success-box { background: #d4edda; border-left: 4px solid #4CAF50; padding: 15px; margin: 20px 0; border-radius: 5px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Welcome Back!</h1>
          </div>
          <div class="content">
            <p>Hello ${ownerName},</p>
            
            <div class="success-box">
              <strong>Good News!</strong><br>
              Your FixItPH account has been reinstated and you can now access all features again.
            </div>
            
            <p>Please ensure you follow our community guidelines to maintain your account in good standing.</p>
            
            <p>Thank you for your cooperation!</p>
            
            <div class="footer">
              <p>This is an automated notification from FixItPH</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `
  }),

  // ✅ Add this new template
  notifyAuthority: (authorityName, reportDetails, admin, mapsLink) => ({
    subject: `🚨 New Report Forwarded: ${reportDetails.title}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .report-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .label { font-weight: bold; color: #667eea; margin-top: 15px; }
          .value { margin: 5px 0 15px 0; }
          .coordinates { background: #f0f4ff; padding: 10px; border-radius: 5px; margin: 10px 0; }
          .image-container { text-align: center; margin: 20px 0; }
          .report-image { max-width: 100%; border-radius: 8px; }
          .badge { display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: bold; }
          .urgent { background: #ff4444; color: white; }
          .normal { background: #4CAF50; color: white; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .map-button { display: inline-block; padding: 10px 20px; background: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚨 New Report Forwarded</h1>
            <p>FixItPH Community Report System</p>
          </div>
          
          <div class="content">
            <p>Dear ${authorityName},</p>
            
            <p>A new community report has been forwarded to your attention by <strong>${admin.barangayName}</strong>.</p>
            
            <div class="report-card">
              <h2 style="margin-top: 0; color: #667eea;">${reportDetails.title}</h2>
              
              <span class="badge ${reportDetails.isUrgent ? 'urgent' : 'normal'}">
                ${reportDetails.isUrgent ? '🔴 URGENT' : '✅ Normal Priority'}
              </span>
              
              <div class="label">📍 Location:</div>
              <div class="value">${reportDetails.location}</div>
              
              ${(reportDetails.latitude && reportDetails.longitude) ? `
                <div class="coordinates">
                  <div class="label">🌐 GPS Coordinates:</div>
                  <div class="value">
                    <strong>Latitude:</strong> ${reportDetails.latitude}<br>
                    <strong>Longitude:</strong> ${reportDetails.longitude}
                  </div>
                  <a href="${mapsLink}" target="_blank" class="map-button">
                    📍 View on Google Maps
                  </a>
                </div>
              ` : ''}
              
              <div class="label">📂 Category:</div>
              <div class="value">${reportDetails.category}</div>
              
              <div class="label">📝 Description:</div>
              <div class="value">${reportDetails.description}</div>
              
              <div class="label">👤 Reported By:</div>
              <div class="value">${reportDetails.reportedBy}</div>
              
              <div class="label">📅 Reported At:</div>
              <div class="value">${new Date(reportDetails.reportedAt).toLocaleString()}</div>
              
              <div class="label">🆔 Report ID:</div>
              <div class="value">${reportDetails.reportId}</div>
              
              ${reportDetails.imageUrl ? `
                <div class="image-container">
                  <div class="label">📷 Attached Image:</div>
                  <img src="${reportDetails.imageUrl}" alt="Report Image" class="report-image" />
                </div>
              ` : ''}
            </div>
            
            <p style="margin-top: 30px;">
              <strong>Action Required:</strong> Please review this report and take appropriate action as per your department's protocols.
            </p>
            
            <div class="footer">
              <p>This is an automated notification from FixItPH</p>
              <p>Forwarded by: ${admin.barangayName} (${admin.officialEmail})</p>
              <p>Contact: ${admin.officialContact || 'N/A'}</p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
              <p style="font-size: 11px; color: #999;">
                If you believe this report was sent to you in error, please contact the barangay office.
              </p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `
  }),
};

const generateOtp = () => String(crypto.randomInt(100000, 1000000));

const sendOtpEmail = async (to, otp, ownerName) => {
  const subject = 'Your FixItPH verification code';
  const html = buildOtpEmail(otp, ownerName);
  return sendEmailBrevo(to, subject, html);
};

module.exports = { sendEmailBrevo, sendOtpEmail, generateOtp, emailTemplates };