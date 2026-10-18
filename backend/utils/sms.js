// Text messages.
//
// Two kinds of text leave this server:
//  - sign-in codes (OTP), sent through the provider chosen with SMS_PROVIDER, and
//  - ordinary alerts, which still go through Twilio when it is set up (optional).
//
// SMS_PROVIDER: console (default, prints the code in the backend terminal), 2factor, fast2sms or twilio.
const provider = () => String(process.env.SMS_PROVIDER || '').trim().toLowerCase() || 'console';

const isTwilioConfigured = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
// True when ordinary text alerts can really be delivered (Twilio, or Fast2SMS when it is the chosen provider).
const isSmsConfigured = () => isTwilioConfigured() || (provider() === 'fast2sms' && !!process.env.FAST2SMS_API_KEY);

const toE164 = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (String(phone).trim().startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `${process.env.SMS_DEFAULT_COUNTRY_CODE || '+91'}${digits}`;
  return `+${digits}`;
};

// The last 10 digits, which is what the Indian gateways expect.
const national = (phone) => String(phone || '').replace(/\D/g, '').slice(-10);

const sendTwilio = async (phone, text) => {
  const to = toE164(phone);
  if (!to) return false;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM, Body: String(text).slice(0, 450) })
  });
  if (!res.ok) throw new Error(`Twilio responded ${res.status}`);
  return true;
};

// Ordinary alerts (pass links, booking updates). Twilio when it is set up; otherwise Fast2SMS' quick route when
// SMS_PROVIDER=fast2sms (it uses your Fast2SMS balance); otherwise the text is printed in the terminal while developing.
const sendFast2Sms = async (phone, text) => {
  const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: { authorization: process.env.FAST2SMS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ route: 'q', message: String(text).slice(0, 450), language: 'english', flash: 0, numbers: national(phone) })
  });
  if (!res.ok) throw new Error(`Fast2SMS responded ${res.status}`);
  const json = await res.json().catch(() => null);
  if (json && json.return === false) throw new Error(`Fast2SMS: ${json.message || 'not accepted'}`);
  return true;
};

const sendSms = async (phone, text) => {
  const to = toE164(phone);
  if (!to) return false;
  if (isTwilioConfigured()) return sendTwilio(phone, text);
  if (provider() === 'fast2sms' && process.env.FAST2SMS_API_KEY) return sendFast2Sms(phone, text);
  if (process.env.NODE_ENV !== 'production') console.log(`[dev] SMS to ${to}: ${text}`);
  return false;
};

// True when a real gateway will deliver the code. The console provider only prints it.
const isOtpSmsLive = () => {
  const p = provider();
  if (p === '2factor') return !!process.env.TWOFACTOR_API_KEY;
  if (p === 'fast2sms') return !!process.env.FAST2SMS_API_KEY;
  if (p === 'twilio') return isTwilioConfigured();
  return false;
};

const okOrThrow = async (res, name) => {
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    json = null;
  }
  if (!res.ok) throw new Error(`${name} responded ${res.status}`);
  return json;
};

/** Send a one-time code. Returns { sent, via }. `sent` is false when it was only printed in the terminal. */
const sendOtpSms = async (phone, code, minutes = 10) => {
  const p = provider();
  const to = national(phone);
  if (to.length !== 10) throw new Error('That mobile number is not valid');

  if (p === '2factor' && process.env.TWOFACTOR_API_KEY) {
    // https://2factor.in  GET /API/V1/{key}/SMS/{number}/{otp}[/{template}]
    const template = process.env.TWOFACTOR_TEMPLATE ? `/${encodeURIComponent(process.env.TWOFACTOR_TEMPLATE)}` : '';
    const res = await fetch(`https://2factor.in/API/V1/${encodeURIComponent(process.env.TWOFACTOR_API_KEY)}/SMS/${to}/${code}${template}`);
    const json = await okOrThrow(res, '2Factor');
    if (json && String(json.Status).toLowerCase() !== 'success') throw new Error(`2Factor: ${json.Details || 'not accepted'}`);
    return { sent: true, via: '2factor' };
  }

  if (p === 'fast2sms' && process.env.FAST2SMS_API_KEY) {
    // https://www.fast2sms.com  POST /dev/bulkV2 with the OTP route
    const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
      method: 'POST',
      headers: { authorization: process.env.FAST2SMS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ route: 'otp', variables_values: String(code), numbers: to })
    });
    const json = await okOrThrow(res, 'Fast2SMS');
    if (json && json.return === false) throw new Error(`Fast2SMS: ${json.message || 'not accepted'}`);
    return { sent: true, via: 'fast2sms' };
  }

  if (p === 'twilio' && isTwilioConfigured()) {
    await sendTwilio(phone, `Your Nivora code is ${code}. It works for ${minutes} minutes. Do not share it.`);
    return { sent: true, via: 'twilio' };
  }

  // No gateway: print the code so sign-up can still be tried on a laptop.
  if (process.env.NODE_ENV !== 'production') console.log(`\n[dev] SMS code for ${to}: ${code}\n`);
  return { sent: false, via: 'console' };
};

module.exports = { sendSms, sendOtpSms, isSmsConfigured, isOtpSmsLive, smsProvider: provider };
