const express = require('express');
const otp = require('../utils/otp');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { protect, authorize } = require('../middleware/auth');
const { notifyUser } = require('../utils/notifyUser');
const { isSafeUrl } = require('../utils/imageUrl');
const { safeNotifyMany } = require('../utils/safeNotify');
const crypto = require('crypto');
const { sendApprovedEmail, sendRejectedEmail, sendInviteEmail, baseUrl } = require('../utils/accountMail');
const Society = require('../models/Society');

// @route   GET /api/users/notifications
// @desc    Get user notifications
// @access  Private
router.get('/notifications', protect, async (req, res) => {
  try {
    // A vendor's private rating of a resident must never reach the resident: older "X rated you" notices are hidden,
    // and the related job is loaded without the rating fields.
    const visible = { userId: req.user.id, $nor: [{ type: 'service_review', title: /rated you \d stars?$/ }] };
    const notifications = await Notification.find(visible)
      .populate({ path: 'relatedId', select: '-residentRating -residentReview -residentRatedAt' })
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(req.query.limit) || 200, 500))
      .skip(parseInt(req.query.skip) || 0);

    const unreadCount = await Notification.countDocuments({ ...visible, isRead: false });

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
const APPROVABLE_ROLES = ['resident', 'security', 'guard_admin', 'staff', 'vendor'];

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
    sendRejectedEmail({ user, reason: user.rejectedReason });

    res.json({ success: true, message: 'Sign-up rejected' });
  } catch (error) {
    console.error('Reject user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PUT /api/users/approve/:id
// @desc    Approve a resident, guard, staff member or vendor. Staff may approve residents of their own society.
// @access  Private (Admins, and staff for residents)
router.put('/approve/:id', protect, authorize('society_admin', 'super_admin', 'staff'), async (req, res) => {
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
    if (['society_admin', 'staff'].includes(req.user.role) && user.societyId?.toString() !== req.user.societyId?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }
    if (req.user.role === 'staff' && user.role !== 'resident') {
      return res.status(403).json({ success: false, message: 'Staff can approve residents. Guards, staff and vendors are approved by the society admin.' });
    }
    if (user.isApproved) {
      return res.status(409).json({ success: false, message: 'This person is already approved.' });
    }

    user.isApproved = true;
    user.isActive = true;
    user.approvedBy = req.user.id;
    user.approvedAt = new Date();
    user.rejectedAt = undefined;
    user.rejectedReason = undefined;
    await user.save();

    // Tell the person: in the app, by text and by email, straight away. None of these may fail the approval.
    const io = req.app.get('io');
    const byStaff = req.user.role === 'staff';
    const approverName = req.user.name;
    try {
      await notifyUser(io, user._id, {
        societyId: user.societyId,
        type: 'general',
        title: 'Account Approved',
        sms: true,
        message: `Your account has been approved${byStaff ? ' by the society staff' : ' by the admin'}. You can sign in now.`,
        priority: 'high'
      });
    } catch (notifyError) {
      console.error('Could not notify approved user:', notifyError.message);
    }
    try {
      const society = user.societyId ? await Society.findById(user.societyId).select('name') : null;
      await sendApprovedEmail({ user, societyName: society && society.name, approvedByName: approverName });
    } catch (mailError) {
      console.error('Approval email failed:', mailError.message);
    }

    // When staff approved, the admins are told who was approved and by whom.
    if (byStaff) {
      try {
        const admins = await User.find({ societyId: user.societyId, role: 'society_admin', isActive: true }).select('_id');
        await safeNotifyMany(io, (admins || []).map((a) => a._id), {
          societyId: user.societyId,
          type: 'general',
          title: 'Resident approved by staff',
          message: `${approverName} approved ${user.name}${user.flatNo ? ` (flat ${user.block ? `${user.block}-` : ''}${user.flatNo})` : ''}.`,
          priority: 'low',
          actionUrl: '/admin/residents'
        });
      } catch (adminNotifyError) {
        console.error('Could not notify admins of staff approval:', adminNotifyError.message);
      }
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
    const switchable = req.user.role === 'super_admin' ? [...APPROVABLE_ROLES, 'society_admin'] : APPROVABLE_ROLES;
    if (!switchable.includes(user.role)) {
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

// ---- Admins creating accounts ----
// A society admin can add every kind of person in their own society. The super admin can also add society admins,
// for any society. Nobody is given a password: the person gets a link to choose their own, valid for 7 days.
const CREATABLE = {
  society_admin: ['resident', 'security', 'guard_admin', 'staff', 'vendor'],
  super_admin: ['society_admin', 'resident', 'security', 'guard_admin', 'staff', 'vendor']
};
const INVITE_DAYS = 7;

// New reset-style token for the person; the plain token only ever leaves in the link.
const issueSetupLink = async (user) => {
  const token = crypto.randomBytes(20).toString('hex');
  user.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
  user.resetPasswordExpire = Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000;
  await user.save({ validateBeforeSave: false });
  return `${baseUrl()}/reset-password/${token}?welcome=1`;
};

const inviteResult = async (req, user, society) => {
  const setupUrl = await issueSetupLink(user);
  const emailSent = await sendInviteEmail({ user, societyName: society && society.name, invitedByName: req.user.name, setupUrl, days: INVITE_DAYS });
  return { emailSent, setupUrl, days: INVITE_DAYS };
};

// @route   POST /api/users/create
// @desc    Create an account for someone (resident, guard, guard head, staff, vendor; the super admin also society admins)
// @access  Private (Admins)
router.post('/create', protect, authorize('society_admin', 'super_admin'), [
  body('name').trim().isLength({ min: 2, max: 60 }).withMessage('Enter the person\'s name'),
  body('email').trim().isEmail().withMessage('Enter a valid email address').normalizeEmail({ gmail_remove_dots: false }),
  body('phone').matches(/^[0-9]{10}$/).withMessage('Enter a valid 10-digit phone number'),
  body('role').isIn(CREATABLE.super_admin).withMessage('Choose what kind of person this is'),
  body('societyId').optional({ checkFalsy: true }).isMongoId().withMessage('Choose a society'),
  body('flatNo').optional({ checkFalsy: true }).trim().isLength({ max: 20 }),
  body('block').optional({ checkFalsy: true }).trim().isLength({ max: 20 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });

    const { name, email, phone, role, flatNo, block } = req.body;
    if (!CREATABLE[req.user.role].includes(role)) {
      return res.status(403).json({ success: false, message: 'Only the platform admin can add a society admin.' });
    }
    const societyId = req.user.role === 'super_admin' ? req.body.societyId : req.user.societyId;
    if (!societyId) return res.status(400).json({ success: false, message: 'Choose which society this person belongs to.' });
    const society = await Society.findById(societyId).select('name');
    if (!society) return res.status(404).json({ success: false, message: 'Society not found' });
    if (role === 'resident' && !flatNo) return res.status(400).json({ success: false, message: 'Enter the flat number for a resident.' });
    if (await User.findOne({ email })) return res.status(409).json({ success: false, message: 'Someone already has an account with this email.' });

    let user;
    try {
      user = await User.create({
        name,
        email,
        phone,
        role,
        societyId,
        flatNo: role === 'resident' ? flatNo : undefined,
        block: role === 'resident' && block ? block : undefined,
        // Nobody knows this password. The person chooses their own through the link below.
        password: `${crypto.randomBytes(18).toString('base64url')}a1`,
        isApproved: true,
        approvedBy: req.user.id,
        approvedAt: new Date(),
        isActive: true,
        // The admin vouches for the person, and choosing a password through the emailed link proves the address.
        emailVerified: true,
        phoneVerified: true
      });
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ success: false, message: 'Someone already has an account with this email.' });
      if (e.name === 'ValidationError') return res.status(400).json({ success: false, message: Object.values(e.errors)[0].message });
      throw e;
    }

    const invite = await inviteResult(req, user, society);

    // When the platform admin adds someone, the society's own admins should know.
    if (req.user.role === 'super_admin' && role !== 'society_admin') {
      const admins = await User.find({ societyId, role: 'society_admin', isActive: true }).select('_id');
      await safeNotifyMany(req.app.get('io'), admins.map((a) => a._id), {
        societyId,
        type: 'general',
        title: 'New person added',
        message: `${req.user.name} added ${user.name} as ${role === 'guard_admin' ? 'guard head' : role === 'security' ? 'a guard' : `a ${role.replace('_', ' ')}`}.`,
        actionUrl: '/admin/residents',
        priority: 'low'
      });
    }

    res.status(201).json({
      success: true,
      user: { _id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role, societyId: user.societyId, flatNo: user.flatNo, block: user.block },
      invite,
      message: invite.emailSent ? `Account created. ${user.name} was emailed a link to choose a password.` : `Account created. The email could not be sent, so share the setup link with ${user.name} yourself.`
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/users/:id/invite
// @desc    Send a new setup link to someone who has not signed in yet
// @access  Private (Admins)
router.post('/:id/invite', protect, authorize('society_admin', 'super_admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (!CREATABLE[req.user.role].includes(user.role)) return res.status(403).json({ success: false, message: 'Not authorized' });
    if (req.user.role === 'society_admin' && String(user.societyId) !== String(req.user.societyId)) return res.status(403).json({ success: false, message: 'Not authorized' });
    if (user.lastLogin) return res.status(409).json({ success: false, message: `${user.name} has already signed in. They can use Forgot password if they need a new one.` });
    const society = await Society.findById(user.societyId).select('name');
    const invite = await inviteResult(req, user, society);
    res.json({ success: true, invite, message: invite.emailSent ? `A new link was emailed to ${user.name}.` : 'The email could not be sent, so share the setup link yourself.' });
  } catch (error) {
    console.error('Resend invite error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/users/pending-approvals
// @desc    Get pending approvals
// @access  Private (Admins)
router.get('/pending-approvals', protect, authorize('society_admin', 'super_admin', 'staff'), async (req, res) => {
  try {
    let query = {
      role: { $in: req.user.role === 'staff' ? ['resident'] : APPROVABLE_ROLES },
      isApproved: false,
      isActive: true
    };

    if (['society_admin', 'staff'].includes(req.user.role)) {
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
