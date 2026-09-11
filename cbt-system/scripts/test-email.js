const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const {
  verifySmtpConnection,
  sendTestEmail,
  sanitizeCredentials,
  resolveFromAddress,
} = require('../backend/utils/emailService');

(async () => {
  console.log('====================================================');
  console.log('       SACHT CBT - SMTP Diagnostics & Tester        ');
  console.log('====================================================');

  const rawUser = process.env.SMTP_USER;
  const rawPass = process.env.SMTP_PASS;
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = process.env.SMTP_PORT || '587';
  const service = process.env.SMTP_SERVICE || (host.includes('gmail') ? 'gmail' : 'none');

  console.log(`\n[1] Environment Variables:`);
  console.log(`    SMTP_HOST   : ${host}`);
  console.log(`    SMTP_PORT   : ${port}`);
  console.log(`    SMTP_SERVICE: ${service}`);
  console.log(`    SMTP_USER   : ${rawUser ? rawUser : '(NOT CONFIGURED)'}`);
  console.log(`    SMTP_PASS   : ${rawPass ? '******** (configured)' : '(NOT CONFIGURED)'}`);
  console.log(`    EMAIL_FROM  : ${process.env.EMAIL_FROM || '(default)'}`);

  const { cleanUser, cleanPass } = sanitizeCredentials(rawUser, rawPass);

  if (!cleanUser || !cleanPass) {
    console.log('\n❌ [ERROR] SMTP_USER or SMTP_PASS is empty.');
    console.log('\nTo enable email sending:');
    console.log('1. Open your Google Account (or your SMTP provider).');
    console.log('2. If using Gmail: Enable 2-Step Verification, search "App passwords", and generate a 16-letter App Password.');
    console.log('3. Put your Gmail in SMTP_USER and your 16-letter App Password in SMTP_PASS in cbt-system/.env');
    console.log('4. Re-run: npm run test:email\n');
    process.exit(1);
  }

  console.log(`\n[2] Resolved Sender: ${resolveFromAddress(cleanUser)}`);

  console.log('\n[3] Testing Transporter Connectivity...');
  const verification = await verifySmtpConnection();

  if (!verification.valid) {
    console.log(`\n❌ [SMTP VERIFY FAILED]: ${verification.error}`);
    process.exit(1);
  }

  console.log('✅ [SUCCESS] SMTP Transporter connected and verified successfully!');

  // If a recipient argument is provided, send test email
  const targetRecipient = process.argv[2] || cleanUser;
  console.log(`\n[4] Sending diagnostic test email to: ${targetRecipient}...`);

  const sendResult = await sendTestEmail(targetRecipient);
  if (!sendResult.success) {
    console.log(`\n❌ [SEND FAILED]: ${sendResult.error}`);
    process.exit(1);
  }

  console.log(`✅ [EMAIL SENT SUCCESSFULLY] Message ID: ${sendResult.messageId}`);
  console.log(`Check the inbox (and spam folder) of ${targetRecipient} for the confirmation email.\n`);
  process.exit(0);
})();
