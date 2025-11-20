import nodemailer from 'nodemailer';
import { google } from 'googleapis';

const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, EMAIL_USER } = process.env;

// Create an OAuth2 client
const oAuth2Client = new google.auth.OAuth2(
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground' // redirect URI (for testing)
);

// Set the refresh token
oAuth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

// Helper to get access token
const getAccessToken = async () => {
  const res = await oAuth2Client.getAccessToken();
  return res.token;
};

// Create transporter using OAuth2
const createTransporter = async () => {
  const accessToken = await getAccessToken();
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: EMAIL_USER,
      clientId: GMAIL_CLIENT_ID,
      clientSecret: GMAIL_CLIENT_SECRET,
      refreshToken: GMAIL_REFRESH_TOKEN,
      accessToken,
    },
  });
};

// Send OTP email
export const sendOTPEmail = async (email, otp) => {
  try {
    const transporter = await createTransporter();
    const mailOptions = {
      from: `"Endless Grind Gym" <${EMAIL_USER}>`,
      to: email,
      subject: '🔐 Your Verification Code',
      html: `
      <!DOCTYPE html>
      <html>
      <body>
        <div style="font-family: Arial, sans-serif; text-align:center;">
          <h2>🔐 Verify Your Email</h2>
          <p>Your OTP is:</p>
          <div style="font-size: 48px; font-weight:bold; color:#667eea;">${otp}</div>
          <p>Valid for 2 minutes</p>
          <p style="font-size:12px; color:#666;">This is an automated email. Do not reply.</p>
        </div>
      </body>
      </html>
      `,
    };
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ OTP Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending OTP email:', error);
    return { success: false, error: error.message };
  }
};

// Send Coach Notification email
export const sendCoachNotification = async (coachEmail, clientData) => {
  try {
    const transporter = await createTransporter();
    const mailOptions = {
      from: `"Endless Grind Gym" <${EMAIL_USER}>`,
      to: coachEmail,
      subject: '🎉 You’ve Got a New Client!',
      html: `
      <!DOCTYPE html>
      <html>
      <body>
        <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto;">
          <h2>💪 New Client Assignment!</h2>
          <p>Name: <strong>${clientData.name}</strong></p>
          ${clientData.nickname ? `<p>Nickname: ${clientData.nickname}</p>` : ''}
          <p>Age/Sex: ${clientData.age} / ${clientData.sex}</p>
          <p>Email: ${clientData.email}</p>
          ${clientData.facebook ? `<p>Facebook: ${clientData.facebook}</p>` : ''}
          ${clientData.weight ? `<p>Weight: ${clientData.weight} kg</p>` : ''}
          ${clientData.height ? `<p>Height: ${clientData.height} cm</p>` : ''}
          <p>Package: <strong>${clientData.package_title}</strong> (₱${clientData.package_price})</p>
          <p>Start Date: ${new Date().toLocaleDateString()}</p>
          <p>Goal: ${clientData.goal}</p>
        </div>
      </body>
      </html>
      `,
    };
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Coach email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending coach email:', error);
    return { success: false, error: error.message };
  }
};

// Test email
export const testEmailConnection = async () => {
  try {
    const transporter = await createTransporter();
    await transporter.verify();
    console.log('✅ Email server ready');
    return true;
  } catch (error) {
    console.error('❌ Email server failed:', error);
    return false;
  }
};
