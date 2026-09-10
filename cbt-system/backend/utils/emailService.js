const nodemailer = require('nodemailer');

/**
 * Escapes HTML characters in user input to prevent HTML injection in emails.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Creates or retrieves the Nodemailer transporter based on environment variables.
 */
function createTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    return null;
  }

  const transportOptions = {
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    // Enforce reasonable connection timeouts so requests don't hang
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  };

  if (process.env.SMTP_SERVICE) {
    transportOptions.service = process.env.SMTP_SERVICE;
  }

  return nodemailer.createTransport(transportOptions);
}

/**
 * Generates email content dynamically for a registered user.
 */
function buildWelcomeEmailContent(fullName) {
  const safeName = escapeHtml(fullName);

  const subject = 'Welcome to SACHT CBT 🎉';

  const text = `Hello ${fullName},

Welcome to SACHT CBT!

Your account has been successfully created, and you can now log in and start practicing for your medical and national examinations.

You can use your account to:
Practice CBT questions
Choose different subjects/courses
Take timed examinations
Review your results
Track your practice history

Thank you for using SACHT CBT.

Best regards,
SACHT CBT Team`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7fafc; color: #2d3748;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
    <tr>
      <td style="background: linear-gradient(135deg, #1e3a8a 0%, #0284c7 100%); padding: 28px 24px; text-align: center; color: #ffffff;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">Sultan Abdur-Rahman School of Health Technology</h1>
        <p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9;">SACHT National CBT Examination Portal</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px 28px;">
        <p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px;">Hello <strong>${safeName}</strong>,</p>
        <p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px;">Welcome to <strong>SACHT CBT!</strong></p>
        <p style="font-size: 15px; line-height: 1.6; margin: 0 0 20px; color: #4a5568;">
          Your account has been successfully created, and you can now log in and start practicing for your medical and national examinations.
        </p>
        <div style="background-color: #f8fafc; border-left: 4px solid #0284c7; padding: 16px 20px; border-radius: 4px; margin: 20px 0;">
          <p style="font-size: 15px; font-weight: 600; margin: 0 0 10px; color: #1e293b;">You can use your account to:</p>
          <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #475569;">
            <li>Practice CBT questions</li>
            <li>Choose different subjects/courses</li>
            <li>Take timed examinations</li>
            <li>Review your results</li>
            <li>Track your practice history</li>
          </ul>
        </div>
        <p style="font-size: 15px; line-height: 1.6; margin: 24px 0 8px;">Thank you for using SACHT CBT.</p>
        <p style="font-size: 15px; line-height: 1.6; margin: 0 0 8px;">
          Best regards,<br />
          <strong>SACHT CBT Team</strong>
        </p>
      </td>
    </tr>
    <tr>
      <td style="background-color: #f1f5f9; padding: 16px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
        This is an automated notification from the SACHT CBT Examination Portal. Please do not reply directly to this email.
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

/**
 * Sends a personalized welcome email to a newly registered user.
 * 
 * Resilient behavior:
 * - If credentials are not configured, logs a note and returns gracefully.
 * - If delivery fails, logs the error securely without exposing credentials.
 * - Never throws an unhandled error so registration flow is never broken.
 * 
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.fullName - Recipient display/registered name
 * @returns {Promise<{ success: boolean, skipped?: boolean, error?: string, messageId?: string }>}
 */
async function sendWelcomeEmail({ to, fullName }) {
  if (!to || !to.includes('@')) {
    console.warn(`[EmailService] Invalid recipient email address provided: ${to}`);
    return { success: false, error: 'Invalid recipient email' };
  }

  const recipientName = String(fullName || 'Student').trim();
  const recipientEmail = String(to).trim().toLowerCase();

  const transporter = createTransporter();

  if (!transporter) {
    console.log(`[EmailService] SMTP credentials not configured in .env. Skipping welcome email for ${recipientEmail}.`);
    return { success: false, skipped: true, message: 'SMTP credentials not configured' };
  }

  const fromAddress = process.env.EMAIL_FROM || `"SACHT CBT Team" <${process.env.SMTP_USER}>`;
  const { subject, text, html } = buildWelcomeEmailContent(recipientName);

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to: recipientEmail,
      subject,
      text,
      html,
    });

    console.log(`[EmailService] Welcome email sent successfully to ${recipientEmail} (messageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[EmailService] Failed to send welcome email to ${recipientEmail}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendWelcomeEmail,
  buildWelcomeEmailContent,
  escapeHtml,
};
