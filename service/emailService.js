import nodemailer from 'nodemailer';
import { google } from 'googleapis';

const {
  EMAIL_USER,
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  GMAIL_REFRESH_TOKEN,
} = process.env;

// Setup OAuth2 client
const oAuth2Client = new google.auth.OAuth2(
  GMAIL_CLIENT_ID,
  GMAIL_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground' // redirect URI
);
oAuth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

// Create transporter (fresh per email)
const createTransporter = async () => {
  const accessToken = await oAuth2Client.getAccessToken();

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      type: 'OAuth2',
      user: EMAIL_USER,
      clientId: GMAIL_CLIENT_ID,
      clientSecret: GMAIL_CLIENT_SECRET,
      refreshToken: GMAIL_REFRESH_TOKEN,
      accessToken: accessToken.token,
    },
    tls: {
      rejectUnauthorized: false, // Needed for Render
    },
  });
};

// ------------------------- OTP EMAIL -------------------------
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
        <head>
          <style>
            body { font-family: Arial; text-align:center; color:#333; }
            .header { background: linear-gradient(135deg,#667eea,#764ba2); color:white; padding:30px; border-radius:10px 10px 0 0; }
            .content { background:#f9f9f9; padding:40px; border-radius:0 0 10px 10px; }
            .otp-box { background:white; padding:30px; border-radius:10px; margin:30px 0; box-shadow:0 4px 6px rgba(0,0,0,0.1); }
            .otp-code { font-size:48px; font-weight:bold; color:#667eea; margin:20px 0; letter-spacing:8px; }
            .warning { background:#fff3cd; padding:15px; border-left:4px solid #ffc107; margin:20px 0; text-align:left; border-radius:4px; }
            .footer { text-align:center; margin-top:30px; padding-top:20px; border-top:2px solid #eee; color:#666; font-size:14px; }
          </style>
        </head>
        <body>
          <div class="header"><h1>🔐 Verify Your Email</h1><p>Welcome to Endless Grind Gym!</p></div>
          <div class="content">
            <p>Your verification code is:</p>
            <div class="otp-box">
              <div class="otp-code">${otp}</div>
              <p>Valid for 2 minutes</p>
            </div>
            <div class="warning">
              <strong>⚠️ Security Notice:</strong>
              <ul>
                <li>Never share this code with anyone</li>
                <li>This code expires in 2 minutes</li>
                <li>If you didn't request this, please ignore this email</li>
              </ul>
            </div>
          </div>
          <div class="footer">
            <p><strong>Endless Grind Gym</strong></p>
            <p>Start your fitness journey today 💪</p>
            <p>This is an automated email. Please do not reply.</p>
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

// ------------------- COACH NOTIFICATION EMAIL -------------------
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
        <head>
          <style>
            body { font-family: Arial; color:#333; max-width:600px; margin:0 auto; }
            .header { background: linear-gradient(135deg,#667eea,#764ba2); color:white; padding:30px; text-align:center; border-radius:10px 10px 0 0; }
            .content { background:#f9f9f9; padding:30px; border-radius:0 0 10px 10px; }
            .client-info { background:white; padding:20px; border-radius:8px; margin:20px 0; box-shadow:0 2px 4px rgba(0,0,0,0.1); }
            .info-row { display:flex; padding:10px 0; border-bottom:1px solid #eee; }
            .info-label { font-weight:bold; width:140px; color:#667eea; }
            .info-value { flex:1; }
            .highlight { background:#fff3cd; padding:15px; border-left:4px solid #ffc107; margin:20px 0; border-radius:4px; }
            .footer { text-align:center; margin-top:30px; padding-top:20px; border-top:2px solid #eee; color:#666; font-size:14px; }
          </style>
        </head>
        <body>
          <div class="header"><h1>💪 New Client Assignment!</h1><p>You have a new client ready to start their fitness journey</p></div>
          <div class="content">
            <h2 style="color:#667eea;">Client Details</h2>
            <div class="client-info">
              <div class="info-row"><div class="info-label">Name:</div><div class="info-value"><strong>${clientData.name}</strong></div></div>
              ${clientData.nickname ? `<div class="info-row"><div class="info-label">Nickname:</div><div class="info-value">${clientData.nickname}</div></div>` : ''}
              <div class="info-row"><div class="info-label">Age/Sex:</div><div class="info-value">${clientData.age} / ${clientData.sex}</div></div>
              <div class="info-row"><div class="info-label">Email:</div><div class="info-value">${clientData.email}</div></div>
              ${clientData.facebook ? `<div class="info-row"><div class="info-label">Facebook:</div><div class="info-value">${clientData.facebook}</div></div>` : ''}
              ${clientData.weight ? `<div class="info-row"><div class="info-label">Weight:</div><div class="info-value">${clientData.weight} kg</div></div>` : ''}
              ${clientData.height ? `<div class="info-row"><div class="info-label">Height:</div><div class="info-value">${clientData.height} cm</div></div>` : ''}
              <div class="info-row"><div class="info-label">Package:</div><div class="info-value"><strong>${clientData.package_title}</strong> (₱${clientData.package_price})</div></div>
              <div class="info-row" style="border-bottom:none;"><div class="info-label">Start Date:</div><div class="info-value">${new Date().toLocaleDateString()}</div></div>
            </div>
            <div class="highlight"><strong>🎯 Fitness Goal:</strong><p>${clientData.goal}</p></div>
          </div>
          <div class="footer">
            <p><strong>Endless Grind Gym</strong></p>
            <p>Empowering fitness journeys, one client at a time 💪</p>
            <p>This is an automated notification. Do not reply.</p>
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

// ------------------- TEST CONNECTION -------------------
export const testEmailConnection = async () => {
  try {
    const transporter = await createTransporter();
    await transporter.verify();
    console.log('✅ Email server ready');
    return true;
  } catch (err) {
    console.error('❌ Email server failed:', err);
    return false;
  }
};
