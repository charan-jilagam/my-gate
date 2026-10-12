// Web push (browser notifications even when the app is closed). Needs VAPID keys; without them it does nothing.
const webpush = require('web-push');

let ready = false;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || `mailto:${process.env.EMAIL_USER || 'admin@example.com'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  ready = true;
}

const isPushConfigured = () => ready;

// Sends to every saved device of a user. Returns the endpoints that are gone so the caller can delete them.
const sendPush = async (subscriptions, payload) => {
  if (!ready || !subscriptions?.length) return [];
  const dead = [];
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload));
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) dead.push(sub.endpoint);
      }
    })
  );
  return dead;
};

module.exports = { sendPush, isPushConfigured };
