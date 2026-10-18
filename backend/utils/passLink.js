// The entry pass link sent to a guest: by text message and, when the resident gave an email address, by email with the
// QR code attached. Best effort: a failed message never fails the invitation.
const QRCode = require('qrcode');
const sendEmail = require('./sendEmail');
const { sendSms } = require('./sms');
const Society = require('../models/Society');

const baseUrl = () => String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
const passUrl = (passId) => `${baseUrl()}/pass/${passId}`;
const codeOfId = (passId) => String(passId || '').slice(0, 8).toUpperCase();
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const first = (name) => String(name || 'a resident').trim().split(/\s+/)[0];

const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: process.env.APP_TIMEZONE || 'Asia/Kolkata' }) : null);

/**
 * Sends the pass to the guest. `visitor` is the saved invitation, `resident` the person who invited them.
 * Returns { sms, email } saying which channels were handed to a provider.
 */
const sendPassLink = async ({ visitor, resident }) => {
  const result = { sms: false, email: false };
  const passId = visitor.passId;
  if (!passId) return result;
  const link = passUrl(passId);
  const code = codeOfId(passId);
  let societyName = 'your host\'s society';
  try {
    const society = await Society.findById(visitor.societyId).select('name').lean();
    if (society && society.name) societyName = society.name;
  } catch (e) {
    /* the name is only a nicety */
  }
  const flat = [visitor.block, visitor.flatNo].filter(Boolean).join('-') || 'the flat';
  const host = first(resident && resident.name);
  const arrival = when(visitor.expectedArrival);

  if (visitor.phone) {
    try {
      const text = `Nivora: You have an entry pass for ${societyName} (${flat}) from ${host}. Pass code ${code}. Open your pass: ${link}`;
      result.sms = !!(await sendSms(visitor.phone, text));
    } catch (e) {
      console.error('Pass SMS failed:', e.message);
    }
  }

  if (visitor.email && sendEmail.isEmailConfigured()) {
    try {
      const png = await QRCode.toBuffer(String(visitor.qrCode), { errorCorrectionLevel: 'M', width: 300, margin: 1 });
      const lines = [`Hello ${visitor.name},`, `${host} has invited you to ${societyName}, ${flat}.`, arrival ? `Expected: ${arrival}` : null, `Pass code: ${code}`, `Open your pass: ${link}`, 'Show the QR code or tell the guard the pass code when you arrive and again when you leave.'].filter(Boolean);
      await sendEmail({
        email: visitor.email,
        subject: `Your Nivora entry pass for ${societyName}`,
        message: lines.join('\n'),
        html: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;border:1px solid #dde;border-radius:12px;padding:20px">
<p style="margin:0;color:#667;font-size:12px">Nivora entry pass</p>
<h2 style="margin:4px 0 2px">${esc(visitor.name)}</h2>
<p style="margin:0 0 12px;color:#334">Invited by ${esc(host)} &middot; ${esc(societyName)}, ${esc(flat)}${arrival ? `<br>Expected ${esc(arrival)}` : ''}</p>
<div style="text-align:center"><img src="cid:passqr" width="200" height="200" alt="Entry pass QR code"><p style="margin:8px 0 0;color:#667;font-size:12px">Pass code</p><p style="margin:0;font:bold 26px monospace;letter-spacing:4px">${esc(code)}</p></div>
<p style="text-align:center;margin:16px 0"><a href="${esc(link)}" style="background:#0f5c4d;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Open your pass</a></p>
<p style="color:#667;font-size:13px">Show the QR code or tell the guard the pass code when you arrive and again when you leave.</p></div>`,
        attachments: [{ filename: 'entry-pass.png', content: png, cid: 'passqr' }]
      });
      result.email = true;
    } catch (e) {
      console.error('Pass email failed:', e.message);
    }
  }
  return result;
};

module.exports = { sendPassLink, passUrl, codeOfId };
