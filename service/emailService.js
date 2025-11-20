import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// ===============================
// SEND OTP EMAIL
// ===============================
export const sendOTPEmail = async (email, otp) => {
  try {
    const response = await resend.emails.send({
      from: "Endless Grind Gym <onboarding@resend.dev>",
      to: email,
      subject: "🔐 Your Verification Code",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #f9f9f9;
              padding: 40px;
              border-radius: 0 0 10px 10px;
              text-align: center;
            }
            .otp-box {
              background: white;
              padding: 30px;
              border-radius: 10px;
              margin: 30px 0;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .otp-code {
              font-size: 48px;
              font-weight: bold;
              letter-spacing: 8px;
              color: #667eea;
              margin: 20px 0;
            }
            .warning {
              background: #fff3cd;
              padding: 15px;
              border-left: 4px solid #ffc107;
              margin: 20px 0;
              border-radius: 4px;
              text-align: left;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 2px solid #eee;
              color: #666;
              font-size: 14px;
            }
          </style>
        </head>

        <body>
          <div class="header">
            <h1 style="margin: 10px 0;">🔐 Verify Your Email</h1>
            <p style="margin: 5px 0; opacity: 0.9;">Welcome to Endless Grind Gym!</p>
          </div>

          <div class="content">
            <p>Your verification code is:</p>

            <div class="otp-box">
              <div class="otp-code">${otp}</div>
              <p style="color: #666;">Valid for 2 minutes</p>
            </div>

            <div class="warning">
              <strong>⚠️ Security Notice:</strong>
              <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                <li>Never share this code with anyone</li>
                <li>This code expires in 2 minutes</li>
                <li>If you didn't request this, please ignore this email</li>
              </ul>
            </div>
          </div>

          <div class="footer">
            <p><strong>Endless Grind Gym</strong></p>
            <p>Start your fitness journey today 💪</p>
            <p style="font-size: 12px;">This is an automated email. Please do not reply.</p>
          </div>
        </body>
        </html>
      `,
    });

    console.log("✅ OTP Email Sent:", response);
    return { success: true };
  } catch (error) {
    console.error("❌ Error sending OTP email:", error);
    return { success: false, error };
  }
};

// ===============================
// SEND COACH NOTIFICATION EMAIL
// ===============================
export const sendCoachNotification = async (coachEmail, clientData) => {
  try {
    const response = await resend.emails.send({
      from: "Endless Grind Gym <onboarding@resend.dev>",
      to: coachEmail,
      subject: "🎉 You've Got a New Client!",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 10px 10px 0 0;
            }
            .content {
              background: #f9f9f9;
              padding: 30px;
              border-radius: 0 0 10px 10px;
            }
            .client-info {
              background: white;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .info-row {
              display: flex;
              padding: 10px 0;
              border-bottom: 1px solid #eee;
            }
            .info-label {
              font-weight: bold;
              width: 140px;
              color: #667eea;
            }
            .info-value {
              flex: 1;
            }
            .highlight {
              background: #fff3cd;
              padding: 15px;
              border-left: 4px solid #ffc107;
              margin: 20px 0;
              border-radius: 4px;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              padding-top: 20px;
              border-top: 2px solid #eee;
              color: #666;
              font-size: 14px;
            }
            .emoji {
              font-size: 24px;
            }
          </style>
        </head>

        <body>
          <div class="header">
            <div class="emoji">💪</div>
            <h1>New Client Assignment!</h1>
            <p>You have a new client ready to start their fitness journey</p>
          </div>

          <div class="content">
            <h2 style="color: #667eea;">Client Details</h2>

            <div class="client-info">
              <div class="info-row">
                <div class="info-label">Name:</div>
                <div class="info-value"><strong>${clientData.name}</strong></div>
              </div>

              ${clientData.nickname ? `
              <div class="info-row">
                <div class="info-label">Nickname:</div>
                <div class="info-value">${clientData.nickname}</div>
              </div>` : ""}

              <div class="info-row">
                <div class="info-label">Age / Sex:</div>
                <div class="info-value">${clientData.age} years old / ${clientData.sex}</div>
              </div>

              <div class="info-row">
                <div class="info-label">Email:</div>
                <div class="info-value"><a href="mailto:${clientData.email}">${clientData.email}</a></div>
              </div>

              ${clientData.facebook ? `
              <div class="info-row">
                <div class="info-label">Facebook:</div>
                <div class="info-value">${clientData.facebook}</div>
              </div>` : ""}

              ${clientData.weight ? `
              <div class="info-row">
                <div class="info-label">Weight:</div>
                <div class="info-value">${clientData.weight} kg</div>
              </div>` : ""}

              ${clientData.height ? `
              <div class="info-row">
                <div class="info-label">Height:</div>
                <div class="info-value">${clientData.height} cm</div>
              </div>` : ""}

              <div class="info-row">
                <div class="info-label">Package:</div>
                <div class="info-value"><strong>${clientData.package_title}</strong> (₱${clientData.package_price})</div>
              </div>

              <div class="info-row" style="border-bottom: none;">
                <div class="info-label">Start Date:</div>
                <div class="info-value">
                  ${new Date().toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </div>
              </div>
            </div>

            <div class="highlight">
              <strong>🎯 Fitness Goal:</strong>
              <p>${clientData.goal}</p>
            </div>

            <p><strong>Next Steps:</strong></p>
            <ul>
              <li>Review the client's fitness goals and health information</li>
              <li>Reach out to schedule an initial assessment</li>
              <li>Prepare a personalized training plan</li>
              <li>Welcome your new client and start their transformation journey!</li>
            </ul>
          </div>

          <div class="footer">
            <p><strong>Endless Grind Gym</strong></p>
            <p>Empowering fitness journeys, one client at a time 💪</p>
            <p style="font-size: 12px;">This is an automated notification. Please do not reply.</p>
          </div>
        </body>
        </html>
      `,
    });

    console.log("✅ Coach Notification Sent:", response);
    return { success: true };
  } catch (error) {
    console.error("❌ Error sending coach email:", error);
    return { success: false, error };
  }
};

// REMOVE nodemailer testEmailConnection — Resend doesn't use SMTP
export const testEmailConnection = async () => {
  console.log("ℹ️ Resend uses HTTPS, no SMTP connection needed. Always ready.");
  return true;
};
