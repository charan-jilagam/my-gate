// SMS through Twilio's REST API. With no Twilio settings, nothing is sent (the text is logged in development).
const isSmsConfigured = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);

const toE164 = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (String(phone).trim().startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `${process.env.SMS_DEFAULT_COUNTRY_CODE || '+91'}${digits}`;
  return `+${digits}`;
};

const sendSms = async (phone, text) => {
  const to = toE164(phone);
  if (!to) return false;
  if (!isSmsConfigured()) {
    if (process.env.NODE_ENV !== 'production') console.log(`[dev] SMS to ${to}: ${text}`);
    return false;
  }
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM, Body: String(text).slice(0, 300) })
  });
  if (!res.ok) throw new Error(`Twilio responded ${res.status}`);
  return true;
};

module.exports = { sendSms, isSmsConfigured };
