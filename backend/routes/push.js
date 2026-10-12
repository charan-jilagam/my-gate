const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { isPushConfigured } = require('../utils/push');
const { isSmsConfigured } = require('../utils/sms');

const router = express.Router();

// @route   GET /api/push/config
// @desc    What this server can do (browser push key, SMS) and the user's own choices
// @access  Private
router.get('/config', protect, (req, res) => {
  res.json({
    success: true,
    pushEnabled: isPushConfigured(),
    publicKey: isPushConfigured() ? process.env.VAPID_PUBLIC_KEY : null,
    smsEnabled: isSmsConfigured(),
    prefs: { push: req.user.notificationPrefs?.push !== false, sms: req.user.notificationPrefs?.sms !== false }
  });
});

// @route   POST /api/push/subscribe
// @desc    Save this browser so it can receive push notifications
// @access  Private
router.post('/subscribe', protect, [
  body('endpoint').isURL({ require_tld: false }).withMessage('Invalid subscription'),
  body('keys.p256dh').notEmpty(),
  body('keys.auth').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const { endpoint, keys } = req.body;

    // One entry per browser; replace if it is already saved.
    await User.updateOne({ _id: req.user.id }, { $pull: { pushSubscriptions: { endpoint } } });
    await User.updateOne(
      { _id: req.user.id },
      { $push: { pushSubscriptions: { $each: [{ endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }], $slice: -5 } } }
    );
    res.status(201).json({ success: true, message: 'Notifications are on for this device' });
  } catch (error) {
    console.error('Push subscribe error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/push/unsubscribe
// @access  Private
router.post('/unsubscribe', protect, [body('endpoint').notEmpty()], async (req, res) => {
  try {
    await User.updateOne({ _id: req.user.id }, { $pull: { pushSubscriptions: { endpoint: req.body.endpoint } } });
    res.json({ success: true, message: 'Notifications are off for this device' });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PUT /api/push/prefs
// @desc    Turn SMS or push on or off for this account
// @access  Private
router.put('/prefs', protect, [
  body('sms').optional().isBoolean(),
  body('push').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const set = {};
    if (req.body.sms !== undefined) set['notificationPrefs.sms'] = req.body.sms === true || req.body.sms === 'true';
    if (req.body.push !== undefined) set['notificationPrefs.push'] = req.body.push === true || req.body.push === 'true';
    if (Object.keys(set).length) await User.updateOne({ _id: req.user.id }, { $set: set });
    res.json({ success: true, message: 'Preferences saved' });
  } catch (error) {
    console.error('Prefs error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
