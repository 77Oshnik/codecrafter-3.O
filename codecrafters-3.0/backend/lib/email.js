const nodemailer = require("nodemailer");

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpSecure = (process.env.SMTP_SECURE || "false").toLowerCase() === "true";
const defaultFrom = process.env.EMAIL_FROM || smtpUser;

function createTransporter() {
  if (!smtpHost || !smtpUser || !smtpPass) {
    throw new Error("SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM in backend/.env.");
  }

  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
}

async function sendVerificationEmail(email, name, otp) {
  const transporter = createTransporter();

  const info = await transporter.sendMail({
    from: defaultFrom,
    to: email,
    subject: "Your verification code",
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 40px 0;">
          <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <h2 style="margin: 0 0 8px; font-size: 22px; color: #111827;">Verify your email</h2>
            <p style="margin: 0 0 32px; color: #6b7280; font-size: 15px;">Hi ${name}, use the code below to complete your sign-up.</p>
            <div style="background: #f3f4f6; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 32px;">
              <span style="font-size: 36px; font-weight: 700; letter-spacing: 12px; color: #111827; font-family: monospace;">${otp}</span>
            </div>
            <p style="margin: 0; color: #9ca3af; font-size: 13px;">This code expires in <strong>10 minutes</strong>. If you didn't request this, you can safely ignore this email.</p>
          </div>
        </body>
      </html>
    `,
  });

  return info;
}

module.exports = { sendVerificationEmail };
