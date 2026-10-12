const express = require('express');
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

    const allowedUpdates = ['name', 'phone', 'profilePic'];
    allowedUpdates.forEach(update => {
      if (req.body[update] !== undefined) {
        req.user[update] = req.body[update];
      }
    });

    await req.user.save();

    res.json({
      success: true,
      user: req.user,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
