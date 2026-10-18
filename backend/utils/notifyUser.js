const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendSms } = require('./sms');
const { sendPush } = require('./push');
const sendEmail = require('./sendEmail');

// Send notification to user: saves it, emits it live, and (when set up) sends a browser push.
// Pass `sms: true` for the few events worth a text message (visitor at the gate, dues, approval), and `email: true`
// when the person should also get an email (service bookings).
const notifyUser = async (io, userId, notificationData) => {
  try {
    const { sms, email, ...data } = notificationData;

    // Create notification in database
    const notification = await Notification.create({
      userId,
      ...data
    });

    // Emit socket event to user's room
    if (io) {
      io.to(`user-${userId}`).emit('notification', {
        id: notification._id,
        ...data,
        createdAt: notification.createdAt
      });
    }

    // Push and SMS are best effort: they must never make the original action fail.
    deliverExternally(userId, data, sms, email).catch((e) => console.error('Notification delivery error:', e.message));

    return notification;
  } catch (error) {
    console.error('Error sending notification:', error);
    throw error;
  }
};

const deliverExternally = async (userId, data, wantsSms, wantsEmail) => {
  const user = await User.findById(userId).select('phone email notificationPrefs +pushSubscriptions');
  if (!user) return;
  const prefs = user.notificationPrefs || {};

  if (prefs.push !== false && user.pushSubscriptions?.length) {
    const dead = await sendPush(user.pushSubscriptions, {
      title: data.title,
      body: data.message,
      url: data.actionUrl || '/'
    });
    if (dead.length) {
      await User.updateOne({ _id: userId }, { $pull: { pushSubscriptions: { endpoint: { $in: dead } } } });
    }
  }

  if (wantsSms && prefs.sms !== false && user.phone) {
    await sendSms(user.phone, `Nivora: ${data.title}. ${data.message}`);
  }

  if (wantsEmail && prefs.email !== false && user.email && sendEmail.isEmailConfigured()) {
    const escape = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    await sendEmail({
      email: user.email,
      subject: `Nivora: ${data.title}`,
      message: `${data.title}\n\n${data.message}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:480px"><h2 style="margin:0 0 8px">${escape(data.title)}</h2><p style="font-size:15px;line-height:1.5">${escape(data.message)}</p><p style="color:#667;font-size:12px">Sent by Nivora</p></div>`
    });
  }
};

// Send notification to multiple users
const notifyUsers = async (io, userIds, notificationData) => {
  try {
    const notifications = [];
    
    for (const userId of userIds) {
      const notification = await notifyUser(io, userId, notificationData);
      notifications.push(notification);
    }

    return notifications;
  } catch (error) {
    console.error('Error sending notifications to multiple users:', error);
    throw error;
  }
};

module.exports = { notifyUser, notifyUsers };
