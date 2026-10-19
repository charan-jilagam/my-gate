const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Society = require('../models/Society');
const { protect, authorize } = require('../middleware/auth');
const generateToken = require('../utils/generateToken');
const sendEmail = require('../utils/sendEmail');
const { notifyUser } = require('../utils/notifyUser');
const crypto = require('crypto');
const { strongPassword } = require('../utils/passwordRules');
const otp = require('../utils/otp');

// Send the codes still owed by this account. Never throws: a code that could not go out is reported, not fatal.
const sendPending = async (user, channels = otp.pendingChannels(user)) => {
  const result = { sent: {}, errors: {} };
  for (const channel of channels) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await otp.sendCode(user, channel);
      result.sent[channel] = r.delivery;
    } catch (e) {
      result.errors[channel] = e.message;
    }
  }
  return result;
};

// Enough of the address and number for the person to recognise where the code went, not enough to reveal them.
const maskEmail = (e) => String(e || '').replace(/^(.).*(@.*)$/, '$1***$2');
const maskPhone = (p) => (p ? `******${String(p).slice(-4)}` : '');
const verifyPayload = (user, extra = {}) => ({ email: user.email, channels: otp.pendingChannels(user), hints: { email: maskEmail(user.email), phone: maskPhone(user.phone) }, ...extra });

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  strongPassword('password'),
  body('phone').matches(/^[0-9]{10}$/).withMessage('Please provide a valid 10-digit phone number'),
  body('role').isIn(['resident', 'security', 'staff', 'vendor']).withMessage('Invalid role'),
  body('societyId').isMongoId().withMessage('Choose your society'),
  body('flatNo').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, password, phone, role, societyId, flatNo, block } = req.body;

    // Check if user already exists. A sign-up that was never verified can be started again
    // (a wrong phone number should not lock the email address for good).
    const userExists = await User.findOne({ email }).select('+password +verifyOtp');
    const retry = userExists && userExists.emailVerified === false && !userExists.lastLogin && !userExists.isApproved;
    if (userExists && !retry) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Check if society exists
    const society = await Society.findById(societyId);
    if (!society) {
      return res.status(404).json({
        success: false,
        message: 'Society not found'
      });
    }

    // Create user. Everyone who signs up on their own waits for a society admin, otherwise anyone could register as a guard,
    // and has to prove the email (and mobile) is theirs with a one-time code.
    let user;
    if (retry) {
      Object.assign(userExists, { name, password, phone, role, societyId, flatNo: flatNo || null, block: block || null, emailVerified: false, phoneVerified: false });
      userExists.verifyOtp = undefined;
      user = await userExists.save();
    } else {
      user = await User.create({
        name,
        email,
        password,
        phone,
        role,
        societyId,
        flatNo: flatNo || null,
        block: block || null,
        isApproved: false,
        emailVerified: false,
        phoneVerified: false
      });
    }

    // Tell the society's admins someone is waiting. A failed notification must not fail the sign-up.
    try {
      const io = req.app.get('io');
      // Staff can approve residents too, so they hear about new resident sign-ups as well.
      const admins = await User.find({ societyId, role: { $in: role === 'resident' ? ['society_admin', 'staff'] : ['society_admin'] }, isActive: true });
      const roleLabel = { resident: 'resident', security: 'guard', staff: 'staff member', vendor: 'vendor' }[role] || role;
      for (const admin of admins) {
        await notifyUser(io, admin._id, {
          societyId,
          type: 'general',
          title: 'New sign-up to approve',
          message: `${user.name} registered as a ${roleLabel}${user.flatNo ? ` (flat ${user.block ? `${user.block}-` : ''}${user.flatNo})` : ''}. Review it in People.`,
          priority: 'medium',
          actionUrl: '/admin/residents'
        });
      }
    } catch (notifyError) {
      console.error('Could not notify admins of new sign-up:', notifyError.message);
    }

    const delivery = await sendPending(user);
    res.status(201).json({
      success: true,
      needsVerification: true,
      ...verifyPayload(user),
      delivery,
      message: 'Account created. Enter the code we sent to finish signing up.'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user and include password
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Too many wrong passwords: pause sign-in for this account for a while.
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const minutes = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(429).json({
        success: false,
        message: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or reset your password.`
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      if (user.loginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        user.loginAttempts = 0;
      }
      await user.save({ validateBeforeSave: false });
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // A rejected sign-up (or a deactivated account) cannot sign in. Say why, so the person is not left guessing.
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: user.rejectedAt
          ? `Your registration was not approved${user.rejectedReason ? `: ${user.rejectedReason}` : '.'} Contact your society admin.`
          : 'This account has been deactivated. Contact your society admin.'
      });
    }

    // New accounts must prove the email (and mobile) first. Send fresh codes so they can finish right here.
    if (!otp.isVerified(user)) {
      const withOtp = await User.findById(user._id).select('+verifyOtp');
      const delivery = await sendPending(withOtp);
      return res.status(403).json({
        success: false,
        needsVerification: true,
        ...verifyPayload(user),
        delivery,
        message: 'Please verify your email to continue. We sent you a code.'
      });
    }

    // Update last login
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id, user.role, user.societyId);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        societyId: user.societyId,
        flatNo: user.flatNo,
        isApproved: user.isApproved
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('societyId', 'name address')
      .select('-password');

    res.json({
      success: true,
      user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Forgot password
// @access  Public
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Please provide a valid email')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const user = await User.findOne({ email: req.body.email });

    if (!user) {
      // Don't reveal if user exists
      return res.json({
        success: true,
        message: 'If email exists, password reset link has been sent'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

    await user.save({ validateBeforeSave: false });

    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // No mail server set up: in development print the link so the flow can still be tested.
    if (!sendEmail.isEmailConfigured()) {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`\n[dev] Email is not configured. Password reset link for ${user.email}:\n${resetUrl}\n`);
        return res.json({
          success: true,
          message: 'Email is not set up on this server. In development the reset link is printed in the backend console.'
        });
      }
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      return res.status(503).json({
        success: false,
        message: 'Password reset email is not available right now. Please contact your society admin.'
      });
    }

    // Send email
    try {
      await sendEmail({
        email: user.email,
        subject: 'Password Reset Request',
        message: `You requested a password reset. Click the link to reset: ${resetUrl}`,
        html: `
          <h2>Password Reset Request</h2>
          <p>You requested a password reset. Click the button below to reset your password:</p>
          <a href="${resetUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
          <p>This link will expire in 10 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
        `
      });

      res.json({
        success: true,
        message: 'Password reset email sent'
      });
    } catch (error) {
      console.error('Reset email failed:', error.message);
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(500).json({
        success: false,
        message: 'Email could not be sent'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/auth/reset-password/:token
// @desc    Reset password
// @access  Public
router.put('/reset-password/:token', [
  strongPassword('password')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    // Get hashed token
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Set new password
    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    // Generate token
    const token = generateToken(user._id, user.role, user.societyId);

    res.json({
      success: true,
      token,
      message: 'Password reset successful'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/auth/update-password
// @desc    Update password
// @access  Private
router.put('/update-password', protect, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  strongPassword('newPassword')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const user = await User.findById(req.user.id).select('+password');

    // Check current password
    const isMatch = await user.comparePassword(req.body.currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    user.password = req.body.newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});


// @route   POST /api/auth/otp/send
// @desc    Ask for a new code for the email or the mobile number of an account that is not verified yet
// @access  Public. The answer is the same whether or not the account exists.
router.post('/otp/send', [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('channel').isIn(['email', 'phone']).withMessage('Choose email or phone')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
    const user = await User.findOne({ email: req.body.email }).select('+verifyOtp');
    const generic = { success: true, message: 'If this account needs verification, a new code is on its way.' };
    if (!user || !otp.pendingChannels(user).includes(req.body.channel)) return res.json(generic);
    try {
      const r = await otp.sendCode(user, req.body.channel);
      return res.json({ ...generic, delivery: r.delivery });
    } catch (e) {
      return res.status(e.status || 500).json({ success: false, message: e.message || 'Could not send the code.' });
    }
  } catch (error) {
    console.error('OTP send error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/auth/otp/verify
// @desc    Check the codes typed for an account. Works one channel at a time or both together.
// @access  Public
router.post('/otp/verify', [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('emailCode').optional({ checkFalsy: true }).matches(/^\d{6}$/).withMessage('The email code is 6 digits'),
  body('phoneCode').optional({ checkFalsy: true }).matches(/^\d{6}$/).withMessage('The mobile code is 6 digits')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });
    const user = await User.findOne({ email: req.body.email }).select('+verifyOtp');
    if (!user) return res.status(400).json({ success: false, message: 'That code is not right.' });
    if (!req.body.emailCode && !req.body.phoneCode) return res.status(400).json({ success: false, message: 'Enter the code you received.' });

    const failed = {};
    for (const [field, channel] of [['emailCode', 'email'], ['phoneCode', 'phone']]) {
      if (!req.body[field] || !otp.pendingChannels(user).includes(channel)) continue;
      // eslint-disable-next-line no-await-in-loop
      const r = await otp.checkCode(user, channel, req.body[field]);
      if (!r.ok) failed[channel] = r.message;
    }
    const pending = otp.pendingChannels(user);
    const bad = Object.values(failed)[0];
    res.status(bad ? 400 : 200).json({
      success: !bad,
      message: bad || (pending.length ? 'Verified. One more code to go.' : 'Verified. You can sign in now.'),
      failed,
      pending,
      done: pending.length === 0
    });
  } catch (error) {
    console.error('OTP verify error:', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/auth/otp/me/send
// @desc    A signed-in user asks for a code, for example after changing their mobile number
// @access  Private
router.post('/otp/me/send', protect, [body('channel').isIn(['email', 'phone'])], async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+verifyOtp');
    if (!otp.pendingChannels(user).includes(req.body.channel)) return res.json({ success: true, message: 'Already verified.' });
    const r = await otp.sendCode(user, req.body.channel);
    res.json({ success: true, delivery: r.delivery, message: 'Code sent.' });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, message: e.status ? e.message : 'Server error' });
  }
});

// @route   POST /api/auth/otp/me/verify
// @access  Private
router.post('/otp/me/verify', protect, [body('channel').isIn(['email', 'phone']), body('code').matches(/^\d{6}$/).withMessage('The code is 6 digits')], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg });
    const user = await User.findById(req.user.id).select('+verifyOtp');
    const r = await otp.checkCode(user, req.body.channel, req.body.code);
    if (!r.ok) return res.status(400).json({ success: false, message: r.message });
    res.json({ success: true, pending: otp.pendingChannels(user), message: 'Verified.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/auth/create-admin
// @desc    Create an admin user
// @access  Private (Super Admin only). The first super admin is created with `npm run create-admin`.
const createAdminHandler = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, password, phone, role, societyId } = req.body;

    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // For society_admin, societyId is required
    if (role === 'society_admin' && !societyId) {
      return res.status(400).json({
        success: false,
        message: 'Society ID is required for society admin'
      });
    }

    // Check if society exists (for society_admin)
    if (role === 'society_admin') {
      const society = await Society.findById(societyId);
      if (!society) {
        return res.status(404).json({
          success: false,
          message: 'Society not found'
        });
      }
    }

    // Create admin user
    const admin = await User.create({
      name,
      email,
      password,
      phone,
      role,
      societyId: role === 'super_admin' ? undefined : societyId,
      isApproved: true,
      isActive: true,
      emailVerified: false,
      phoneVerified: false
    });

    // Generate token
    const token = generateToken(admin._id, admin.role, admin.societyId);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        societyId: admin.societyId
      },
      message: 'Admin user created successfully'
    });
  } catch (error) {
    console.error('Admin creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during admin creation'
    });
  }
};

router.post('/create-admin', protect, authorize('super_admin'), [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  strongPassword('password'),
  body('phone').matches(/^[0-9]{10}$/).withMessage('Please provide a valid 10-digit phone number'),
  body('role').isIn(['super_admin', 'society_admin']).withMessage('Invalid admin role'),
  body('societyId').optional().isMongoId().withMessage('Invalid society ID')
], createAdminHandler);

module.exports = router;
