// Emails about an account's approval. Best effort: a mail problem is logged and never fails the approval.
const sendEmail = require('./sendEmail');

const baseUrl = () => String(process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim().replace(/\/+$/, '');
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const first = (name) => String(name || 'there').trim().split(/\s+/)[0];

const frame = (inner) => `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e3e9e7;border-radius:16px;overflow:hidden">
  <div style="background:#0a3a39;padding:18px 24px;color:#fff;font-size:20px;font-weight:700">Nivora <span style="font-weight:400;font-size:12px;color:#f5a800;margin-left:8px">Smart communities · Safer living</span></div>
  <div style="padding:24px;color:#122a29;font-size:15px;line-height:1.55">${inner}</div>
  <div style="padding:12px 24px;background:#f4f6f4;color:#667;font-size:12px">Sent by Nivora. If this was not you, please ignore this email.</div>
</div>`;

const button = (href, label) => `<p style="margin:22px 0"><a href="${esc(href)}" style="background:#0f4c4a;color:#fff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700;display:inline-block">${esc(label)}</a></p>`;

const send = async (options) => {
  try {
    if (!options.email) return false;
    await sendEmail(options);
    return true;
  } catch (error) {
    console.error('Account email failed:', error.message);
    return false;
  }
};

// "You can sign in now."
const sendApprovedEmail = ({ user, societyName, approvedByName }) => {
  const url = `${baseUrl()}/login`;
  const lines = [`Hi ${first(user.name)},`, `Good news: your Nivora account${societyName ? ` for ${societyName}` : ''} has been approved${approvedByName ? ` by ${approvedByName}` : ''}.`, `You can sign in now: ${url}`];
  return send({
    email: user.email,
    subject: 'Your Nivora account is approved',
    message: lines.join('\n\n'),
    html: frame(`<h2 style="margin:0 0 12px">You are approved, ${esc(first(user.name))}!</h2>
      <p>Your Nivora account${societyName ? ` for <b>${esc(societyName)}</b>` : ''} has been approved${approvedByName ? ` by ${esc(approvedByName)}` : ''}. You can sign in and start using the app right away.</p>
      ${button(url, 'Sign in to Nivora')}
      <p style="color:#5b6f6d;font-size:13px">Tip: add Nivora to your phone's home screen so it opens like an app.</p>`)
  });
};

const sendRejectedEmail = ({ user, reason }) =>
  send({
    email: user.email,
    subject: 'Your Nivora sign-up was not approved',
    message: `Hi ${first(user.name)},\n\nYour sign-up was not approved.${reason ? ` Reason: ${reason}.` : ''}\n\nPlease contact your society office if you think this is a mistake.`,
    html: frame(`<h2 style="margin:0 0 12px">Sign-up not approved</h2>
      <p>Hi ${esc(first(user.name))}, your sign-up was not approved.${reason ? ` <b>Reason:</b> ${esc(reason)}.` : ''}</p>
      <p>Please contact your society office if you think this is a mistake.</p>`)
  });

module.exports = { sendApprovedEmail, sendRejectedEmail };
