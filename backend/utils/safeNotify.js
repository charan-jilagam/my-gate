const { notifyUser } = require('./notifyUser');

// Same as notifyUser, but a failed notification is logged instead of failing the request that caused it.
// Use it after the main action has already been saved.
const safeNotify = async (io, userId, data) => {
  try {
    return await notifyUser(io, userId, data);
  } catch (error) {
    console.error('Notification failed:', error.message);
    return null;
  }
};

const safeNotifyMany = async (io, userIds, data) => {
  const unique = [...new Set(userIds.map(String))];
  await Promise.all(unique.map((id) => safeNotify(io, id, data)));
};

module.exports = { safeNotify, safeNotifyMany };
