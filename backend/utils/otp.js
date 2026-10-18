// One-time codes that prove someone controls an email address or a mobile number.
// Only a keyed hash of the code is stored, never the code itself.
const crypto = require('crypto');
const { generateOTP } = require('./generateOTP');
const sendEmail = require('./sendEmail');
const { sendOtpSms, isOtpSmsLive } = require('./sms');

const MINUTES = 10;
const COOLDOWN_SECONDS = 30;
const MAX_TRIES = 5;
const CHANNELS = ['email', 'phone'];

const secret = () => process.env.JWT_SECRET || 'otp';
const digest = (userId, channel, code) => crypto.createHmac('sha256', secret()).update(`${userId}:${channel}:${code}`).digest('hex');

// Email is always checked. A mobile number is checked when a real SMS gateway is set up, or when running
// locally (the code is printed in the terminal). OTP_REQUIRE_PHONE=true or false overrides this.
const phoneRequired = () => {
  const v = String(process.env.OTP_REQUIRE_PHONE || 'auto').toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return isOtpSmsLive() || process.env.NODE_ENV !== 'production';
};

const requiredChannels = () => (phoneRequired() ? ['email', 'phone'] : ['email']);

// Accounts that existed before verification was added have no flag at all and keep working.
const pendingChannels = (user) => requiredChannels().filter((c) => (c === 'email' ? user.emailVerified === false : user.phoneVerified === false));

const isVerified = (user) => pendingChannels(user).length === 0;

const emailHtml = (code, name) => `
  <div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
    <h2 style="margin:0 0 8px">Verify your email</h2>
    <p style="color:#444">Hi ${String(name || '').replace(/[<>&]/g, '')}, use this code to finish setting up your Nivora account.</p>
    <p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:18px 0">${code}</p>
    <p style="color:#666;font-size:13px">It works for ${MINUTES} minutes. If you did not ask for it, ignore this email.</p>
  </div>`;

/**
 * Make a new code for one channel and send it. Throws { status, message } when it should not be sent yet.
 * `user` must have been loaded with +verifyOtp so earlier state is visible.
 */
const sendCode = async (user, channel) => {
  if (!CHANNELS.includes(channel)) throw Object.assign(new Error('Unknown channel'), { status: 400 });
  const state = (user.verifyOtp && user.verifyOtp[channel]) || {};
  if (state.sentAt && Date.now() - new Date(state.sentAt).getTime() < COOLDOWN_SECONDS * 1000) {
    const wait = Math.ceil((COOLDOWN_SECONDS * 1000 - (Date.now() - new Date(state.sentAt).getTime())) / 1000);
    throw Object.assign(new Error(`Please wait ${wait} seconds before asking for another code.`), { status: 429 });
  }

  const code = generateOTP();
  let delivery;
  if (channel === 'email') {
    if (sendEmail.isEmailConfigured()) {
      await sendEmail({ email: user.email, subject: 'Your Nivora verification code', message: `Your Nivora code is ${code}. It works for ${MINUTES} minutes.`, html: emailHtml(code, user.name) });
      delivery = 'email';
    } else if (process.env.NODE_ENV !== 'production') {
      console.log(`\n[dev] Email is not set up. Verification code for ${user.email}: ${code}\n`);
      delivery = 'console';
    } else {
      throw Object.assign(new Error('Email is not set up on this server. Please contact the society office.'), { status: 503 });
    }
  } else {
    const r = await sendOtpSms(user.phone, code, MINUTES);
    delivery = r.via;
    if (!r.sent && process.env.NODE_ENV === 'production') throw Object.assign(new Error('Text messages are not set up on this server.'), { status: 503 });
  }

  user.verifyOtp = user.verifyOtp || {};
  user.verifyOtp[channel] = { hash: digest(user._id, channel, code), expires: new Date(Date.now() + MINUTES * 60000), tries: 0, sentAt: new Date() };
  user.markModified('verifyOtp');
  await user.save({ validateBeforeSave: false });
  return { delivery };
};

/** Check a typed code. Returns { ok, message }. A right code marks the channel verified. */
const checkCode = async (user, channel, code) => {
  const state = user.verifyOtp && user.verifyOtp[channel];
  if (!state || !state.hash) return { ok: false, message: 'Ask for a new code first.' };
  if (new Date(state.expires).getTime() < Date.now()) return { ok: false, message: 'That code has expired. Ask for a new one.' };
  if ((state.tries || 0) >= MAX_TRIES) return { ok: false, message: 'Too many wrong tries. Ask for a new code.' };

  const given = Buffer.from(digest(user._id, channel, String(code || '').trim()));
  const real = Buffer.from(state.hash);
  const match = given.length === real.length && crypto.timingSafeEqual(given, real);
  if (!match) {
    state.tries = (state.tries || 0) + 1;
    user.markModified('verifyOtp');
    await user.save({ validateBeforeSave: false });
    return { ok: false, message: `That code is not right. ${Math.max(0, MAX_TRIES - state.tries)} tries left.` };
  }

  user.verifyOtp[channel] = undefined;
  user[channel === 'email' ? 'emailVerified' : 'phoneVerified'] = true;
  user.markModified('verifyOtp');
  await user.save({ validateBeforeSave: false });
  return { ok: true };
};

module.exports = { digest, sendCode, checkCode, requiredChannels, pendingChannels, isVerified, phoneRequired, MINUTES, COOLDOWN_SECONDS };
