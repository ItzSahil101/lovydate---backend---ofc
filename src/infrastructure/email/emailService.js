const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || 'smtp.hostinger.com';
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE === 'true'
    : port === 465;
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
  });

  return transporter;
}

async function sendOtpEmail(toEmail, otpCode) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !from) {
    throw new Error('SMTP is not configured');
  }
  const transport = getTransporter();

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your LovyDate Verification Code</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #FFF6F2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed;">
        <tr>
          <td align="center" style="padding: 40px 15px;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 480px; background-color: #FFFFFF; border-radius: 24px; box-shadow: 0 10px 30px rgba(255, 106, 42, 0.08); overflow: hidden; border: 1px solid #FDE7DF;">
              <tr>
                <td align="center" style="padding: 36px 30px 20px 30px; background: linear-gradient(135deg, #FF7A28 0%, #FF4124 100%);">
                  <h1 style="margin: 0; color: #FFFFFF; font-size: 36px; font-weight: 800; letter-spacing: -0.5px;">LövyDate</h1>
                  <p style="margin: 6px 0 0 0; color: #FFF0E6; font-size: 14px;">Where meaningful connections happen</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 36px 30px;">
                  <h2 style="margin: 0 0 12px 0; color: #1E1E1E; font-size: 20px; font-weight: 700;">Verification Code</h2>
                  <p style="margin: 0 0 24px 0; color: #6B6B6B; font-size: 15px; line-height: 1.5;">
                    Please use the 6-digit code below to securely verify your email address and continue on LovyDate.
                  </p>
                  
                  <div style="background-color: #FFF6F2; border-radius: 16px; border: 1.5px dashed #FF6A2A; padding: 22px 10px; text-align: center; margin-bottom: 24px;">
                    <span style="font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 800; color: #FF4124; letter-spacing: 8px;">${otpCode}</span>
                  </div>

                  <p style="margin: 0 0 10px 0; color: #8C8C8C; font-size: 13px; line-height: 1.4;">
                    ⏱️ This code is valid for <strong>10 minutes</strong>. Never share this code with anyone.
                  </p>
                  <p style="margin: 0; color: #8C8C8C; font-size: 13px; line-height: 1.4;">
                    If you did not request this verification, please safely ignore this email.
                  </p>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding: 20px 30px 30px 30px; background-color: #FAF5F0; border-top: 1px solid #F0E3DB;">
                  <p style="margin: 0; color: #A0948C; font-size: 12px;">© 2026 LovyDate. Real people. Genuine connections.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  try {
    const info = await transport.sendMail({
      from,
      to: toEmail,
      subject: `${otpCode} is your LovyDate verification code`,
      text: `Your LovyDate verification code is: ${otpCode}. It expires in 10 minutes.`,
      html,
    });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed to send to ${toEmail}:`, err.message);
    throw err;
  }
}

module.exports = {
  sendOtpEmail,
};
