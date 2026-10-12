const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendSms } = require('./sms');
const { sendPush } = require('./push');

// Send notification to user: saves it, emits it live, and (when set up) sends a browser push.
// Pass `sms: true` for the few events worth a text message (visitor at the gate, dues, approval).
const notifyUser = async (io, userId, notificationData) => {
  try {
    const { sms, ...data } = notificationData;

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
    deliverExternally(userId, data, sms).catch((e) => console.error('Notification delivery error:', e.message));

    return notification;
  } catch (error) {
    console.error('Error sending notification:', error);
    throw error;
  }
};

const deliverExternally = async (userId, data, wantsSms) => {
  const user = await User.findById(userId).select('phone notificationPrefs +pushSubscriptions');
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
    await sendSms(user.phone, `MyGate: ${data.title}. ${data.message}`);
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
