const express = require('express');
const otp = require('../utils/otp');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { protect, authorize } = require('../middleware/auth');
const { notifyUser } = require('../utils/notifyUser');
const { isSafeUrl } = require('../utils/imageUrl');

// @route   GET /api/users/notifications
// @desc    Get user notifications
// @access  Private
router.get('/notifications', protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id })
      .populate('relatedId')
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(req.query.limit) || 200, 500))
      .skip(parseInt(req.query.skip) || 0);

    const unreadCount = await Notification.countDocuments({
      userId: req.user.id,
      isRead: false
    });

    res.json({
      success: true,
      count: notifications.length,
      unreadCount,
      notifications
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/users/notifications/:id/read
// @desc    Mark notification as read
// @access  Private
router.put('/notifications/:id/read', protect, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    if (notification.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    res.json({
      success: true,
      notification,
      message: 'Notification marked as read'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/users/notifications/read-all
// @desc    Mark all notifications as read
// @access  Private
router.put('/notifications/read-all', protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user.id, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Roles that sign up on their own and must be approved by a society admin.
const APPROVABLE_ROLES = ['resident', 'security', 'staff', 'vendor'];

// @route   PUT /api/users/reject/:id
// @desc    Reject a sign-up. The person can no longer sign in and sees the reason.
// @access  Private (Admins)
router.put('/reject/:id', protect, authorize('society_admin', 'super_admin'), [
  body('reason').optional().trim().isLength({ max: 200 }).withMessage('Reason must be 200 characters or fewer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (!APPROVABLE_ROLES.includes(user.role)) {
      return res.status(400).json({ success: false, message: 'This account cannot be rejected' });
    }
    if (user.isApproved) {
      return res.status(400).json({ success: false, message: 'This person is already approved. Deactivate the account instead.' });
    }
    if (req.user.role === 'society_admin' && user.societyId?.toString() !== req.user.societyId?.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    user.isActive = false;
    user.rejectedAt = new Date();
    user.rejectedReason = req.body.reason || undefined;
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, message: 'Sign-up rejected' });
  } catch (error) {
    console.error('Reject user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PUT /api/users/approve/:id
// @desc    Approve a resident, guard, staff member or vendor
// @access  Private (Admins)
router.put('/approve/:id', protect, authorize('society_admin', 'super_admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!APPROVABLE_ROLES.includes(user.role)) {
      return res.status(400).json({
        success: false,
        message: 'Only residents, guards, staff and vendors need approval'
      });
    }

    // Check access
    if (req.user.role === 'society_admin' && user.societyId?.toString() !== req.user.societyId?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    user.isApproved = true;
    user.isActive = true;
    user.approvedBy = req.user.id;
    user.approvedAt = new Date();
    user.rejectedAt = undefined;
    user.rejectedReason = undefined;
    await user.save();

    // Notify user
    const io = req.app.get('io');
    if (io) {
      await notifyUser(io, user._id, {
        societyId: user.societyId,
        type: 'general',
        title: 'Account Approved',
        sms: true,
        message: 'Your account has been approved by the admin',
        priority: 'high'
      });
    }

    res.json({
      success: true,
      user,
      message: 'User approved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/users/:id/active
// @desc    Deactivate or reactivate an approved account (blocks or restores sign-in)
// @access  Private (Admins)
router.put('/:id/active', protect, authorize('society_admin', 'super_admin'), [
  body('active').isBoolean().withMessage('active must be true or false')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!APPROVABLE_ROLES.includes(user.role)) {
      return res.status(400).json({ success: false, message: 'This account cannot be changed here' });
    }
    if (req.user.role === 'society_admin' && user.societyId?.toString() !== req.user.societyId?.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (!user.isApproved) {
      return res.status(400).json({ success: false, message: 'Approve or reject this sign-up instead' });
    }

    const active = req.body.active === true || req.body.active === 'true';
    user.isActive = active;
    await user.save({ validateBeforeSave: false });

    res.json({ success: true, message: active ? `${user.name} can sign in again` : `${user.name} has been deactivated` });
  } catch (error) {
    console.error('Set active error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/users/pending-approvals
// @desc    Get pending approvals
// @access  Private (Admins)
router.get('/pending-approvals', protect, authorize('society_admin', 'super_admin'), async (req, res) => {
  try {
    let query = {
      role: { $in: APPROVABLE_ROLES },
      isApproved: false,
      isActive: true
    };

    if (req.user.role === 'society_admin') {
      query.societyId = req.user.societyId;
    }

    const users = await User.find(query)
      .select('name email phone role flatNo block createdAt')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: users.length,
      users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', protect, [
  body('name').optional().trim().notEmpty(),
  body('phone').optional().matches(/^[0-9]{10}$/),
  body('profilePic').optional({ values: 'falsy' }).custom((v) => isSafeUrl(v)).withMessage('Invalid picture')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const phoneChanged = req.body.phone !== undefined && req.body.phone !== req.user.phone;
    const allowedUpdates = ['name', 'phone', 'profilePic'];
    allowedUpdates.forEach(update => {
      if (req.body[update] !== undefined) {
        req.user[update] = req.body[update];
      }
    });
    // A new number has to be proven again.
    if (phoneChanged && otp.phoneRequired()) req.user.phoneVerified = false;

    await req.user.save();

    let needsVerification = [];
    if (phoneChanged && otp.phoneRequired()) {
      needsVerification = ['phone'];
      try {
        const withOtp = await User.findById(req.user.id).select('+verifyOtp');
        await otp.sendCode(withOtp, 'phone');
      } catch (e) {
        console.error('Could not send the mobile code:', e.message);
      }
    }

    res.json({
      success: true,
      user: req.user,
      needsVerification,
      message: needsVerification.length ? 'Profile updated. Enter the code we sent to your new number.' : 'Profile updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ---- Emergency contacts: the people each user wants reached in an emergency ----------------------

const PHONE = /^[0-9+\-() ]{7,20}$/;

// @route   GET /api/users/emergency-contacts
router.get('/emergency-contacts', protect, async (req, res) => {
  res.json({ success: true, contacts: (req.user.emergencyContacts || []).map((c) => ({ _id: c._id, name: c.name, phone: c.phone, relation: c.relation, notify: c.notify })) });
});

// @route   PUT /api/users/emergency-contacts
// @desc    Replaces the whole list (up to 5). The person edits their own list from Profile.
router.put('/emergency-contacts', protect, [
  body('contacts').isArray({ max: 5 }).withMessage('You can add up to 5 emergency contacts'),
  body('contacts.*.name').trim().isLength({ min: 2, max: 60 }).withMessage('Enter the name of each contact'),
  body('contacts.*.phone').trim().matches(PHONE).withMessage('Enter a valid phone number for each contact'),
  body('contacts.*.relation').optional({ nullable: true }).trim().isLength({ max: 30 }).withMessage('Keep the relation short, for example "Brother"'),
  body('contacts.*.notify').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
    const seen = new Set();
    const contacts = [];
    for (const c of req.body.contacts) {
      const key = String(c.phone).replace(/\D/g, '').slice(-10);
      if (seen.has(key)) continue; // the same number twice is one contact
      seen.add(key);
      contacts.push({ name: c.name, phone: String(c.phone).trim(), relation: (c.relation || '').trim(), notify: c.notify !== false });
    }
    req.user.emergencyContacts = contacts;
    await req.user.save({ validateBeforeSave: true });
    res.json({ success: true, contacts: req.user.emergencyContacts, message: contacts.length ? 'Emergency contacts saved' : 'Emergency contacts cleared' });
  } catch (error) {
    if (error.name === 'ValidationError') return res.status(400).json({ success: false, message: Object.values(error.errors)[0].message });
    console.error('Save emergency contacts error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ---- Guard head -----------------------------------------------------------------------------------

// @route   PUT /api/users/:id/guard-head
// @desc    Make an approved guard the head of the guards (or return them to an ordinary guard)
// @access  Private (Admins)
router.put('/:id/guard-head', protect, authorize('society_admin', 'super_admin'), [
  body('isHead').isBoolean().withMessage('isHead must be true or false')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!['security', 'guard_admin'].includes(user.role)) {
      return res.status(400).json({ success: false, message: 'Only a guard can be made the head of the guards.' });
    }
    if (req.user.role === 'society_admin' && user.societyId?.toString() !== req.user.societyId?.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (!user.isApproved || !user.isActive) {
      return res.status(400).json({ success: false, message: 'Approve this guard first.' });
    }
    const makeHead = req.body.isHead === true || req.body.isHead === 'true';
    user.role = makeHead ? 'guard_admin' : 'security';
    await user.save({ validateBeforeSave: false });

    const io = req.app.get('io');
    try {
      await notifyUser(io, user._id, {
        societyId: user.societyId,
        type: 'general',
        title: makeHead ? 'You are now the head of the guards' : 'You are now a guard again',
        message: makeHead
          ? 'You can plan shifts, see attendance and see where guards are. Sign out and in again if the menu does not change.'
          : 'You no longer manage the roster. Your own shifts and duty stay the same.',
        priority: 'high'
      });
    } catch (e) {
      console.error('Guard head notification failed:', e.message);
    }
    res.json({ success: true, user: { _id: user._id, name: user.name, role: user.role }, message: makeHead ? `${user.name} is now the head of the guards` : `${user.name} is an ordinary guard again` });
  } catch (error) {
    console.error('Guard head error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
