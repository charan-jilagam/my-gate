const nodemailer = require('nodemailer');

// Two ways to send:
//  1. BREVO_API_KEY set  -> Brevo's HTTPS API. Use this on hosts that block SMTP ports (Render's free plan does).
//  2. EMAIL_HOST/USER/PASS -> normal SMTP (Gmail, Mailtrap...).
const hasBrevo = () => !!process.env.BREVO_API_KEY;
const hasSmtp = () => !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
const isEmailConfigured = () => hasBrevo() || hasSmtp();

const fromName = () => process.env.EMAIL_FROM_NAME || 'Nivora';
// The sender must be an address verified in Brevo (Senders & IP). EMAIL_FROM wins, then EMAIL_USER.
const fromAddress = () => process.env.EMAIL_FROM || process.env.EMAIL_USER;

const sendViaBrevo = async (options) => {
  const html = options.html || options.message;
  const attachments = options.attachments || [];
  // Brevo has no inline (cid) images, so the QR goes as a normal attachment and the broken inline <img> is dropped.
  const cleanHtml = String(html).replace(/<img[^>]*cid:[^>]*>/g, '');
  const body = {
    sender: { name: fromName(), email: fromAddress() },
    to: [{ email: options.email }],
    subject: options.subject,
    htmlContent: cleanHtml,
    textContent: options.message
  };
  if (attachments.length) {
    body.attachment = attachments.map((a) => ({ name: a.filename, content: Buffer.from(a.content).toString('base64') }));
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${data.message || res.statusText}`);
  console.log('Message sent (Brevo): %s', data.messageId);
  return data;
};

const sendViaSmtp = async (options) => {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: Number(process.env.EMAIL_PORT) === 465,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    // A blocked port must fail in seconds, not hang the request for minutes.
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000
  });
  const info = await transporter.sendMail({
    from: `${fromName()} <${process.env.EMAIL_USER}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html || options.message,
    attachments: options.attachments
  });
  console.log('Message sent: %s', info.messageId);
  return info;
};

const sendEmail = async (options) => (hasBrevo() ? sendViaBrevo(options) : sendViaSmtp(options));

module.exports = sendEmail;
module.exports.isEmailConfigured = isEmailConfigured;
