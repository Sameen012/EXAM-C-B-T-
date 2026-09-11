const path = require('path');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');

// Ensure environment variables are loaded regardless of how this file was imported
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

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
 * Strips accidental wrapping quotation marks (common when copying into hosting panels like Render).
 */
function stripQuotes(value) {
  if (!value) return '';
  let s = String(value).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/**
 * Sanitizes SMTP credentials:
 * - Trims whitespace and wrapping quotes from user and password
 * - Strips internal spaces from 16-character Google App Passwords (e.g. "xxxx yyyy zzzz wwww" -> "xxxxyyyyzzzzwwww")
 */
function sanitizeCredentials(user, pass) {
  const cleanUser = stripQuotes(user);
  let cleanPass = stripQuotes(pass);

  // Google app passwords are 16 letters, displayed in 4 blocks of 4
  const strippedPass = cleanPass.replace(/\s+/g, '');
  if (strippedPass.length === 16) {
    cleanPass = strippedPass;
  }

  return { cleanUser, cleanPass };
}

/**
 * Resolves the From address.
 * If user has a personal Gmail or custom SMTP, sending with "no-reply@sacht.edu.ng" will fail DMARC/SPF
 * or be rejected by Gmail SMTP (550 sender address not permitted).
 */
function resolveFromAddress(user) {
  const configuredFrom = stripQuotes(process.env.EMAIL_FROM);
  
  if (configuredFrom && !configuredFrom.includes('no-reply@sacht.edu.ng')) {
    return configuredFrom;
  }

  if (user) {
    return `"SACHT CBT Team" <${user}>`;
  }

  return configuredFrom || '"SACHT CBT Team" <no-reply@sacht.edu.ng>';
}

/**
 * Creates or retrieves the Nodemailer transporter based on environment variables.
 */
function createTransporter() {
  const host = stripQuotes(process.env.SMTP_HOST || 'smtp.gmail.com');
  const port = parseInt(stripQuotes(process.env.SMTP_PORT || '587'), 10);
  const secure = stripQuotes(process.env.SMTP_SECURE) === 'true' || port === 465;
  const rawUser = process.env.SMTP_USER;
  const rawPass = process.env.SMTP_PASS;

  const { cleanUser, cleanPass } = sanitizeCredentials(rawUser, rawPass);

  if (!cleanUser || !cleanPass) {
    return null;
  }

  const configuredService = stripQuotes(process.env.SMTP_SERVICE || '').toLowerCase();
  const isGmail = host.includes('gmail') || cleanUser.endsWith('@gmail.com') || configuredService === 'gmail';

  const transportOptions = {
    auth: {
      user: cleanUser,
      pass: cleanPass,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 25000,
  };

  if (isGmail) {
    // Nodemailer has dedicated preset for Gmail handling SSL/ports automatically
    transportOptions.service = 'gmail';
  } else {
    transportOptions.host = host;
    transportOptions.port = port;
    transportOptions.secure = secure;
    if (configuredService) {
      transportOptions.service = configuredService;
    }
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
/**
 * Sends an email via Resend HTTPS API (Port 443).
 * Essential for cloud platforms like Render Free Tier that block outbound SMTP ports (25, 465, 587).
 */
async function sendViaResend({ to, subject, html, text }) {
  const apiKey = stripQuotes(process.env.RESEND_API_KEY);
  if (!apiKey) return null;

  const sender = stripQuotes(process.env.EMAIL_FROM) || 'SACHT CBT <onboarding@resend.dev>';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: sender,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  const resJson = await response.json();
  if (!response.ok) {
    throw new Error(resJson.message || `Resend API returned status ${response.status}`);
  }

  return { success: true, messageId: resJson.id };
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
  const { subject, text, html } = buildWelcomeEmailContent(recipientName);

  // 1. Try Resend HTTPS API if configured (works seamlessly on Render Free Tier without port blocks)
  if (process.env.RESEND_API_KEY) {
    try {
      const resendRes = await sendViaResend({ to: recipientEmail, subject, html, text });
      if (resendRes && resendRes.success) {
        console.log(`[EmailService] Welcome email sent via Resend API to ${recipientEmail} (id: ${resendRes.messageId})`);
        return resendRes;
      }
    } catch (resendError) {
      console.error(`[EmailService] Resend API delivery error: ${resendError.message}`);
    }
  }

  // 2. Fall back to SMTP transporter
  const transporter = createTransporter();

  if (!transporter) {
    console.log(`[EmailService] SMTP credentials not configured in .env. Skipping welcome email for ${recipientEmail}.`);
    return { success: false, skipped: true, message: 'SMTP credentials not configured' };
  }

  const { cleanUser } = sanitizeCredentials(process.env.SMTP_USER, process.env.SMTP_PASS);
  const fromAddress = resolveFromAddress(cleanUser);

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
    let errorDetail = error.message;
    if (error.message && error.message.includes('timeout')) {
      errorDetail += ' (Notice: Render free tier blocks outbound SMTP ports 465/587. Use RESEND_API_KEY over HTTPS port 443 on Render free tier)';
    } else if (error.message && error.message.includes('535') && cleanUser.endsWith('@gmail.com')) {
      errorDetail += ' (Hint: Gmail requires a 16-character Google App Password, not your standard Gmail password)';
    }
    console.error(`[EmailService] Failed to send welcome email to ${recipientEmail}: ${errorDetail}`);
    return { success: false, error: errorDetail };
  }
}

/**
 * Verifies the SMTP transporter connection without sending an email.
 * @returns {Promise<{ configured: boolean, valid: boolean, error?: string, user?: string }>}
 */
async function verifySmtpConnection() {
  const { cleanUser, cleanPass } = sanitizeCredentials(process.env.SMTP_USER, process.env.SMTP_PASS);

  if (!cleanUser || !cleanPass) {
    return {
      configured: false,
      valid: false,
      error: 'SMTP_USER or SMTP_PASS is missing in environment configuration',
    };
  }

  const transporter = createTransporter();
  if (!transporter) {
    return {
      configured: false,
      valid: false,
      error: 'Could not initialize SMTP transport with current settings',
    };
  }

  try {
    await transporter.verify();
    return { configured: true, valid: true, user: cleanUser };
  } catch (error) {
    let errorDetail = error.message;
    if (error.message && error.message.includes('535') && cleanUser.endsWith('@gmail.com')) {
      errorDetail += ' (Google App Password required for Gmail accounts)';
    }
    return {
      configured: true,
      valid: false,
      error: errorDetail,
      user: cleanUser,
    };
  }
}

/**
 * Sends a diagnostic test email to confirm delivery.
 * @param {string} recipient
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
async function sendTestEmail(recipient) {
  if (!recipient || !recipient.includes('@')) {
    return { success: false, error: 'Valid recipient email required' };
  }

  const transporter = createTransporter();
  if (!transporter) {
    return { success: false, error: 'SMTP credentials not configured in .env' };
  }

  const { cleanUser } = sanitizeCredentials(process.env.SMTP_USER, process.env.SMTP_PASS);
  const fromAddress = resolveFromAddress(cleanUser);

  try {
    const info = await transporter.sendMail({
      from: fromAddress,
      to: recipient.trim().toLowerCase(),
      subject: 'SACHT CBT - SMTP Test Email',
      text: 'This is a confirmation test email from the SACHT National CBT Examination Portal. Your email notification setup is functioning correctly.',
      html: `<div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #0284c7;">SACHT CBT Email Service Test</h2>
        <p>This is an automated confirmation test email from the <strong>SACHT National CBT Examination Portal</strong>.</p>
        <p style="color: #16a34a; font-weight: bold;">&#10004; Your email notification configuration is active and working properly!</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #666;">Sender: ${escapeHtml(fromAddress)}</p>
      </div>`,
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    let errorDetail = error.message;
    if (error.message && error.message.includes('535') && cleanUser.endsWith('@gmail.com')) {
      errorDetail += ' (Hint: Gmail requires a 16-character Google App Password, not your standard Gmail password)';
    }
    return { success: false, error: errorDetail };
  }
}

module.exports = {
  sendWelcomeEmail,
  sendTestEmail,
  verifySmtpConnection,
  buildWelcomeEmailContent,
  escapeHtml,
  sanitizeCredentials,
  resolveFromAddress,
};
