// Every morning each daily-help person gets a new gate code, and the QR code for it is mailed:
// to the helper's own email when the household gave one, otherwise to the households they work for.
// Runs from server.js. It is safe to run on several servers or restart often: a helper is claimed for the day with one
// conditional update before anything is sent, so nobody gets the same mail twice.
const QRCode = require('qrcode');
const DailyHelp = require('../models/DailyHelp');
const Society = require('../models/Society');
const User = require('../models/User');
const sendEmail = require('./sendEmail');
const { renewCodes } = require('./dailyHelpCodes');
const { DEFAULT_TZ, todayIn } = require('./timezone');

const SEND_FROM_HOUR = Number(process.env.DAILY_CODE_MAIL_HOUR || 5); // society local time
const EVERY_MS = 10 * 60 * 1000;

const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const hourIn = (tz, now = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(now));

const dayLabel = (date, tz) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/** Builds and sends one mail. `to` is an email address. */
const sendCodeMail = async ({ to, help, societyName, date, tz, forHousehold }) => {
  const payload = { type: 'daily_help', code: help.code, societyId: String(help.societyId), date };
  const png = await QRCode.toBuffer(JSON.stringify(payload), { errorCorrectionLevel: 'M', width: 320, margin: 1 });
  const when = dayLabel(date, tz);
  const intro = forHousehold ? `Today's gate code for ${help.name} (${when}).` : `Hello ${help.name}, here is your gate code for ${when}.`;
  const text = [
    intro,
    `Society: ${societyName}`,
    `Code: ${help.code}`,
    'Show the QR code (attached) or tell the guard the code at the gate. It works for today only.',
    'If you forget it, say yesterday\'s code. The guard can still find you and will tell you today\'s code.'
  ].join('\n');
  await sendEmail({
    email: to,
    subject: `${help.name}: gate code for ${when}`,
    message: text,
    html: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;border:1px solid #dde;border-radius:12px;padding:20px">
<p style="margin:0;color:#667;font-size:12px">${esc(societyName)} &middot; daily gate code</p>
<h2 style="margin:4px 0 2px">${esc(help.name)}</h2>
<p style="margin:0 0 12px;color:#334">${esc(when)}</p>
<div style="text-align:center"><img src="cid:helperqr" width="200" height="200" alt="Gate QR code"><p style="margin:8px 0 0;color:#667;font-size:12px">Today's code</p><p style="margin:0;font:bold 28px monospace;letter-spacing:5px">${esc(help.code)}</p></div>
<p style="color:#667;font-size:13px">Show the QR code or tell the guard this code at the gate. It works for today only. If you forget it, say yesterday's code. The guard will find you and tell you today's code.</p></div>`,
    attachments: [{ filename: 'gate-code.png', content: png, cid: 'helperqr' }]
  });
};

const recipientsFor = async (help) => {
  if (help.email) return { emails: [help.email], forHousehold: false };
  const users = await User.find({ _id: { $in: help.residents.map((r) => r.userId) }, isActive: { $ne: false } }).select('email').lean();
  return { emails: [...new Set(users.map((u) => u.email).filter(Boolean))], forHousehold: true };
};

/** One pass over every society whose morning has started. Returns how many helpers were mailed. */
const runOnce = async (now = new Date()) => {
  if (!sendEmail.isEmailConfigured()) return 0;
  let sent = 0;
  const societies = await Society.find({ isActive: { $ne: false } }).select('name timezone').lean();
  for (const society of societies) {
    const tz = society.timezone || DEFAULT_TZ;
    if (hourIn(tz, now) < SEND_FROM_HOUR) continue; // too early in this society's day
    const today = todayIn(tz, now);
    // eslint-disable-next-line no-await-in-loop
    await renewCodes(society._id, tz);
    // eslint-disable-next-line no-await-in-loop
    const due = await DailyHelp.find({ societyId: society._id, isActive: true, mailedDate: { $ne: today } }).limit(2000);
    for (const help of due) {
      // eslint-disable-next-line no-await-in-loop
      const claimed = await DailyHelp.findOneAndUpdate({ _id: help._id, mailedDate: { $ne: today } }, { $set: { mailedDate: today } });
      if (!claimed) continue; // another server took it
      try {
        // eslint-disable-next-line no-await-in-loop
        const { emails, forHousehold } = await recipientsFor(help);
        for (const to of emails) {
          // eslint-disable-next-line no-await-in-loop
          await sendCodeMail({ to, help, societyName: society.name, date: today, tz, forHousehold });
          sent += 1;
        }
      } catch (e) {
        console.error(`Daily code mail for ${help.name} failed:`, e.message);
        // Let the next run try again.
        // eslint-disable-next-line no-await-in-loop
        await DailyHelp.updateOne({ _id: help._id }, { $unset: { mailedDate: 1 } }).catch(() => {});
      }
    }
  }
  return sent;
};

let timer = null;
const startDailyCodeMail = () => {
  if (timer) return;
  const tick = () => runOnce().catch((e) => console.error('Daily code mail run failed:', e.message));
  setTimeout(tick, 30 * 1000); // shortly after start, then every 10 minutes
  timer = setInterval(tick, EVERY_MS);
  if (timer.unref) timer.unref();
};

module.exports = { startDailyCodeMail, runOnce, sendCodeMail, hourIn };
