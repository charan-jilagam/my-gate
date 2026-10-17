const crypto = require('crypto');

// Razorpay client created on first use, so the app starts (and tests run) without payment keys.
let cached = null;

const enabled = () => !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

const client = () => {
  if (!enabled()) return null;
  if (!cached) {
    const Razorpay = require('razorpay');
    cached = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
  }
  return cached;
};

// Razorpay signs "order_id|payment_id" with the key secret. Compared in constant time.
const signatureOk = (orderId, paymentId, signature) => {
  if (!enabled() || typeof signature !== 'string') return false;
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = { enabled, client, signatureOk };
