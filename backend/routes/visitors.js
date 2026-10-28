const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Visitor = require('../models/Visitor');
const { protect, authorize, checkSocietyAccess , scopeToSociety } = require('../middleware/auth');
router.param('id', scopeToSociety(require('../models/Visitor')));
const { generateQRCode } = require('../utils/generateQR');
const { notifyUser } = require('../utils/notifyUser');
const { sendPassLink, passUrl } = require('../utils/passLink');
const crypto = require('crypto');
const { floorOf } = require('../utils/routeKit');
const rateLimit = require('express-rate-limit');

// The pass code is what proves someone holds the invitation, so guessing it has to be slow.
const guessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user ? req.user.id : req.ip),
  validate: false,
  message: { success: false, message: 'Too many wrong codes. Please wait 15 minutes and try again.' }
});

// Until when an invitation works is decided in utils/visitorPass.js (the resident's leaving time, else 24 hours).
const { DEFAULT_VALID_HOURS, MAX_VALID_HOURS, validHours, expiryOf, checkPlannedExit } = require('../utils/visitorPass');
const validForRule = body('validForHours').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1, max: MAX_VALID_HOURS }).withMessage(`Choose a validity between 1 hour and ${MAX_VALID_HOURS / 24} days`);

const passId = (v) => {
  try {
    return String(JSON.parse(v.qrCode).visitorId || '');
  } catch (e) {
    return '';
  }
};

// Accepts what a guard types (8 letters and digits) or the whole text read from the QR code.
const codeOf = (input) => {
  let text = String(input || '').trim();
  if (text.startsWith('{')) {
    try {
      text = String(JSON.parse(text).visitorId || '');
    } catch (e) {
      text = '';
    }
  }
  return text.toLowerCase();
};

const codeMatches = (v, input) => {
  const given = codeOf(input);
  const id = passId(v).toLowerCase();
  return /^[0-9a-f]{8,32}$/.test(given) && !!id && id.startsWith(given);
};

// Visitors a resident invited must show the code or QR to get in and again to get out.
// Walk-ins are logged by the guard and approved by the resident, so the guard handles them by hand.
const needsCode = (v) => v.source !== 'walk_in';

// Only the resident who owns the invitation may see its code. Guards and admins must be given it by the visitor.
const present = (v, user) => {
  const o = typeof v.toObject === 'function' ? v.toObject() : { ...v };
  const owner = user && user.role === 'resident' && String((o.residentId && o.residentId._id) || o.residentId) === String(user.id);
  if (!owner) delete o.qrCode;
  o.requiresCode = needsCode(o);
  o.validForHours = validHours(o);
  o.expiresAt = expiryOf(o);
  o.expired = o.status === 'approved' && needsCode(o) && !!o.expiresAt && Date.now() > o.expiresAt.getTime();
  return o;
};

// @route   POST /api/visitors/invite
// @desc    Invite a visitor
// @access  Private (Residents)
router.post('/invite', protect, authorize('resident'), [
  body('name').trim().notEmpty().withMessage('Visitor name is required'),
  body('phone').matches(/^[0-9]{10}$/).withMessage('Please provide a valid phone number'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Enter a valid email address for the guest'),
  body('purpose').isIn(['personal', 'business', 'delivery', 'service', 'other']).withMessage('Invalid purpose'),
  body('expectedArrival').optional().isISO8601().withMessage('Invalid date format'),
  body('plannedExit').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Pick when the visitor will leave'),
  validForRule
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    const exitProblem = checkPlannedExit(req.body.plannedExit, req.body.expectedArrival);
    if (exitProblem) return res.status(400).json({ success: false, message: exitProblem });

    const {
      name,
      phone,
      email,
      purpose,
      purposeDescription,
      numberOfVisitors,
      vehicleNumber,
      expectedArrival,
      validForHours,
      notes
    } = req.body;

    // Generate unique QR code
    const qrData = {
      visitorId: crypto.randomBytes(16).toString('hex'),
      residentId: req.user.id,
      societyId: req.user.societyId,
      timestamp: Date.now()
    };
    const qrCodeString = JSON.stringify(qrData);

    const visitor = await Visitor.create({
      residentId: req.user.id,
      societyId: req.user.societyId,
      name,
      phone,
      email,
      purpose,
      purposeDescription,
      numberOfVisitors: numberOfVisitors || 1,
      vehicleNumber,
      flatNo: req.user.flatNo,
      block: req.user.block,
      qrCode: qrCodeString,
      passId: qrData.visitorId,
      expectedArrival: expectedArrival ? new Date(expectedArrival) : null,
      validForHours: validForHours ? Number(validForHours) : DEFAULT_VALID_HOURS,
      plannedExit: req.body.plannedExit ? new Date(req.body.plannedExit) : null,
      notes,
      // A resident inviting a guest is the approval: the guard should let them in without a second step.
      approved: true,
      approvedBy: req.user.id,
      approvedAt: new Date(),
      status: 'approved'
    });

    // Generate QR code image
    const qrCodeImage = await generateQRCode(qrData);

    // Notify security personnel
    const io = req.app.get('io');
    if (io) {
      // Get security users in the society
      const Security = require('../models/User');
      const securityUsers = await Security.find({
        societyId: req.user.societyId,
        role: 'security'
      });

      for (const securityUser of securityUsers) {
        await notifyUser(io, securityUser._id, {
          societyId: req.user.societyId,
          type: 'visitor_approval',
          title: 'Expected visitor',
          message: `${name} is expected at ${req.user.block ? `${req.user.block}-` : ''}${req.user.flatNo} (invited by ${req.user.name})`,
          relatedId: visitor._id,
          relatedModel: 'Visitor',
          actionUrl: `/visitors/${visitor._id}`
        });
      }
    }

    // Send the guest their pass by text message and, if an email was given, by email. This never delays or fails the invitation.
    // Wait a few seconds at most so the resident can be told what was sent, but never let a slow provider hold the invitation up.
    let slowTimer;
    const delivery = await Promise.race([
      sendPassLink({ visitor, resident: req.user }).catch((e) => {
        console.error('Pass link failed:', e.message);
        return { sms: false, email: false };
      }),
      new Promise((resolve) => {
        slowTimer = setTimeout(() => resolve({ sms: false, email: false, slow: true }), 6000);
      })
    ]);
    clearTimeout(slowTimer);

    res.status(201).json({
      success: true,
      visitor: {
        ...present(visitor, req.user),
        passLink: passUrl(qrData.visitorId),
        delivery,
        qrCodeImage
      },
      message: 'Visitor invitation sent successfully'
    });
  } catch (error) {
    console.error('Visitor invite error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/visitors
// @desc    Get visitors (filtered by role)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let query = {};

    // Residents see only their visitors
    if (req.user.role === 'resident') {
      query.residentId = req.user.id;
    }
    // Super admin sees all visitors
    else if (req.user.role === 'super_admin') {
      // No filter - see all visitors
    }
    // Security and society admins see all visitors in their society
    else if (['security', 'guard_admin', 'society_admin'].includes(req.user.role)) {
      query.societyId = req.user.societyId;
    }

    // Filter by status if provided
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Filter by date range
    if (req.query.startDate && req.query.endDate) {
      query.createdAt = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }

    const visitors = await Visitor.find(query)
      .populate('residentId', 'name email phone flatNo')
      .populate('approvedBy', 'name role')
      .populate('loggedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(req.query.limit) || 200, 500))
      .skip(parseInt(req.query.skip) || 0);

    res.json({
      success: true,
      count: visitors.length,
      visitors: visitors.map((v) => present(v, req.user))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/visitors/:id
// @desc    Get single visitor
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id)
      .populate('residentId', 'name email phone flatNo')
      .populate('approvedBy', 'name role')
      .populate('loggedBy', 'name');

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: 'Visitor not found'
      });
    }

    // Check access
    if (req.user.role === 'resident' && visitor.residentId._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this visitor'
      });
    }

    res.json({
      success: true,
      visitor: present(visitor, req.user)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/visitors/:id
// @desc    Edit an invitation that has not been used yet
// @access  Private (Residents, own visitors)
router.put('/:id', protect, authorize('resident'), [
  body('name').optional().trim().notEmpty().withMessage('Visitor name is required'),
  body('phone').optional().matches(/^[0-9]{10}$/).withMessage('Please provide a valid phone number'),
  body('purpose').optional().isIn(['personal', 'business', 'delivery', 'service', 'other']).withMessage('Invalid purpose'),
  body('numberOfVisitors').optional().isInt({ min: 1, max: 50 }),
  body('expectedArrival').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid date format'),
  body('plannedExit').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Pick when the visitor will leave'),
  validForRule
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    const visitor = await Visitor.findById(req.params.id);
    if (!visitor) return res.status(404).json({ success: false, message: 'Visitor not found' });
    if (visitor.residentId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized to edit this visitor' });
    }
    if (!['pending', 'approved'].includes(visitor.status)) {
      return res.status(400).json({ success: false, message: 'Only invitations that have not been used yet can be edited' });
    }

    ['name', 'phone', 'purpose', 'purposeDescription', 'numberOfVisitors', 'vehicleNumber', 'notes'].forEach((f) => {
      if (req.body[f] !== undefined) visitor[f] = req.body[f];
    });
    if (req.body.expectedArrival !== undefined) {
      visitor.expectedArrival = req.body.expectedArrival ? new Date(req.body.expectedArrival) : null;
    }
    if (req.body.validForHours !== undefined) visitor.validForHours = Number(req.body.validForHours) || DEFAULT_VALID_HOURS;
    if (req.body.plannedExit !== undefined) {
      const problem = checkPlannedExit(req.body.plannedExit, visitor.expectedArrival);
      if (problem) return res.status(400).json({ success: false, message: problem });
      visitor.plannedExit = req.body.plannedExit ? new Date(req.body.plannedExit) : null;
    }
    await visitor.save();

    res.json({ success: true, visitor: present(visitor, req.user), message: 'Invitation updated' });
  } catch (error) {
    console.error('Edit visitor error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PUT /api/visitors/:id/approve
// @desc    Approve visitor
// @access  Private (the resident being visited; nobody else can let a visitor in on their behalf)
router.put('/:id/approve', protect, authorize('resident'), async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id);

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: 'Visitor not found'
      });
    }

    // Check if resident is approving their own visitor
    if (req.user.role === 'resident' && visitor.residentId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to approve this visitor'
      });
    }

    visitor.approved = true;
    visitor.approvedBy = req.user.id;
    visitor.approvedAt = new Date();
    visitor.status = 'approved';
    visitor.rejected = false;

    await visitor.save();

    // Notify resident
    const io = req.app.get('io');
    if (io) {
      await notifyUser(io, visitor.residentId, {
        societyId: visitor.societyId,
        type: 'visitor_approval',
        title: 'Visitor Approved',
        message: `Your visitor ${visitor.name} has been approved`,
        relatedId: visitor._id,
        relatedModel: 'Visitor',
        actionUrl: `/visitors/${visitor._id}`
      });
    }

    res.json({
      success: true,
      visitor: present(visitor, req.user),
      message: 'Visitor approved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/visitors/:id/reject
// @desc    Reject visitor
// @access  Private (Residents, Security, Admins)
router.put('/:id/reject', protect, authorize('resident', 'security', 'guard_admin', 'society_admin'), [
  body('reason').optional().trim()
], async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id);

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: 'Visitor not found'
      });
    }

    // Check if resident is rejecting their own visitor
    if (req.user.role === 'resident' && visitor.residentId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to reject this visitor'
      });
    }

    if (!['pending', 'approved'].includes(visitor.status)) {
      return res.status(400).json({
        success: false,
        message: 'This visit has already started or finished and cannot be rejected'
      });
    }

    visitor.rejected = true;
    visitor.rejectedReason = req.body.reason || 'No reason provided';
    visitor.status = 'rejected';
    visitor.approved = false;

    await visitor.save();

    // Notify resident
    const io = req.app.get('io');
    if (io) {
      await notifyUser(io, visitor.residentId, {
        societyId: visitor.societyId,
        type: 'visitor_approval',
        title: 'Visitor Rejected',
        message: `Your visitor ${visitor.name} has been rejected`,
        relatedId: visitor._id,
        relatedModel: 'Visitor',
        actionUrl: `/visitors/${visitor._id}`
      });
    }

    res.json({
      success: true,
      visitor: present(visitor, req.user),
      message: 'Visitor rejected'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/visitors/:id/check-in
// @desc    Check in visitor
// @access  Private (Security)
router.put('/:id/check-in', protect, authorize('security', 'guard_admin', 'society_admin', 'super_admin'), guessLimiter, [
  body('code').optional({ nullable: true }).isString().isLength({ max: 400 }),
  body('entryPhoto').optional().trim(),
  body('expectedExit').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Pick when the visitor is expected to leave'),
  body('stayMinutes').optional({ nullable: true, checkFalsy: true }).isInt({ min: 5, max: 1440 }).withMessage('The stay must be between 5 minutes and 24 hours')
], async (req, res) => {
  try {
    const errs = validationResult(req);
    if (!errs.isEmpty()) return res.status(400).json({ success: false, message: errs.array()[0].msg });
    const visitor = await Visitor.findById(req.params.id);

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: 'Visitor not found'
      });
    }

    if (!visitor.approved || visitor.status === 'rejected') {
      return res.status(400).json({
        success: false,
        message: visitor.status === 'rejected' ? 'This visitor was rejected by the resident.' : 'The resident has not approved this visitor yet.'
      });
    }
    if (visitor.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: visitor.status === 'checked_in' ? 'This visitor is already inside.' : 'This pass was already used. The resident has to invite them again.'
      });
    }

    // Nobody is let in on a click alone: the visitor shows the QR or says the code, and the guard enters it.
    if (needsCode(visitor)) {
      if (!codeMatches(visitor, req.body.code)) {
        return res.status(403).json({ success: false, message: req.body.code ? 'That pass code does not match this visitor.' : 'Scan the visitor\'s QR code or enter their pass code to let them in.' });
      }
      const until = expiryOf(visitor);
      if (until && Date.now() > until.getTime()) {
        return res.status(400).json({ success: false, message: 'This invitation has expired. The resident can extend it or invite them again.' });
      }
    }

    // The leaving time the resident gave is used as it is, so the guard has nothing to type. A guard can still set a
    // different one (for example when the visitor says they will stay longer), and walk-ins have none until now.
    const now = new Date();
    const given = req.body.expectedExit ? new Date(req.body.expectedExit) : req.body.stayMinutes ? new Date(now.getTime() + Number(req.body.stayMinutes) * 60000) : null;
    const fromResident = !given && visitor.plannedExit ? new Date(visitor.plannedExit) : null;
    const leaveAt = given || fromResident;
    if (!leaveAt) {
      return res.status(400).json({ success: false, message: 'Pick when the visitor is expected to leave.' });
    }
    if (leaveAt <= now) {
      return res.status(400).json({ success: false, message: 'The expected exit must be later than now.' });
    }
    // A time chosen at the gate is a short stay (up to 24 hours). The resident's own time may cover a longer visit.
    if (!fromResident && leaveAt - now > 24 * 3600 * 1000) {
      return res.status(400).json({ success: false, message: 'At the gate the stay can be up to 24 hours. Longer visits are set by the resident when inviting.' });
    }

    visitor.entryTime = now;
    visitor.expectedExit = leaveAt;
    visitor.checkInMethod = needsCode(visitor) ? 'code' : 'manual';
    visitor.status = 'checked_in';
    visitor.loggedBy = req.user.id;
    visitor.entryPhoto = req.body.entryPhoto || '';

    await visitor.save();

    // Notify resident
    const io = req.app.get('io');
    if (io) {
      await notifyUser(io, visitor.residentId, {
        societyId: visitor.societyId,
        type: 'visitor_entry',
        title: 'Visitor Checked In',
        message: `${visitor.name} has checked in and is expected to leave by ${leaveAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}`,
        relatedId: visitor._id,
        relatedModel: 'Visitor',
        actionUrl: `/visitors/${visitor._id}`
      });
    }

    res.json({
      success: true,
      visitor: present(visitor, req.user),
      message: 'Visitor checked in successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/visitors/:id/check-out
// @desc    Check out visitor
// @access  Private (Security)
router.put('/:id/check-out', protect, authorize('security', 'guard_admin', 'society_admin', 'super_admin'), guessLimiter, [
  body('code').optional({ nullable: true }).isString().isLength({ max: 400 }),
  body('exitPhoto').optional().trim()
], async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id);

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: 'Visitor not found'
      });
    }

    if (visitor.status !== 'checked_in') {
      return res.status(400).json({
        success: false,
        message: 'Visitor must be checked in before check-out'
      });
    }

    // Leaving needs the same proof as entering. Only walk-ins the guard let in by hand can be checked out by hand.
    if (needsCode(visitor) && !codeMatches(visitor, req.body.code)) {
      return res.status(403).json({ success: false, message: req.body.code ? 'That pass code does not match this visitor.' : 'Ask the visitor to show their QR code or say their pass code to check out.' });
    }

    visitor.exitTime = new Date();
    visitor.checkOutMethod = needsCode(visitor) ? 'code' : 'manual';
    visitor.status = 'checked_out';
    visitor.exitPhoto = req.body.exitPhoto || '';

    await visitor.save();

    // Notify resident
    const io = req.app.get('io');
    if (io) {
      await notifyUser(io, visitor.residentId, {
        societyId: visitor.societyId,
        type: 'visitor_entry',
        title: 'Visitor Checked Out',
        message: `${visitor.name} has checked out`,
        relatedId: visitor._id,
        relatedModel: 'Visitor',
        actionUrl: `/visitors/${visitor._id}`
      });
    }

    res.json({
      success: true,
      visitor: present(visitor, req.user),
      message: 'Visitor checked out successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/visitors/logs/today
// @desc    Get today's visitor logs
// @access  Private (Security, Admins)
router.get('/logs/today', protect, authorize('security', 'guard_admin', 'society_admin', 'super_admin'), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const query = {
      createdAt: { $gte: today, $lt: tomorrow }
    };

    // Super admin sees all, others see only their society
    if (req.user.role !== 'super_admin') {
      query.societyId = req.user.societyId;
    }

    const visitors = await Visitor.find(query)
      .populate('residentId', 'name flatNo')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: visitors.length,
      visitors: visitors.map((v) => present(v, req.user))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/visitors/walk-in
// @desc    Guard logs an unannounced visitor; the resident gets a live request to approve or reject
// @access  Private (Security, Admins)
router.post('/walk-in', protect, authorize('security', 'guard_admin', 'society_admin'), [
  body('name').trim().notEmpty().withMessage('Visitor name is required'),
  body('phone').matches(/^[0-9]{10}$/).withMessage('Enter a valid 10-digit phone number'),
  body('flatNo').trim().notEmpty().withMessage('Flat number is required'),
  body('block').optional({ checkFalsy: true }).trim(),
  body('purpose').optional().isIn(['personal', 'business', 'delivery', 'service', 'other']).withMessage('Invalid purpose'),
  body('numberOfVisitors').optional().isInt({ min: 1, max: 50 }).withMessage('Number of visitors must be between 1 and 50'),
  body('vehicleNumber').optional({ checkFalsy: true }).trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const User = require('../models/User');
    const { name, phone, flatNo, block, purpose, numberOfVisitors, vehicleNumber, purposeDescription } = req.body;

    const residentQuery = { societyId: req.user.societyId, role: 'resident', isApproved: true, isActive: true, flatNo };
    if (block) residentQuery.block = block;
    let residents = await User.find({ ...residentQuery, householdHeadId: null }); // the approval goes to the head of the house
    if (residents.length === 0) residents = await User.find(residentQuery);

    if (residents.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No approved resident found for flat ${block ? `${block}-` : ''}${flatNo}`
      });
    }

    const qrCodeString = JSON.stringify({
      visitorId: crypto.randomBytes(16).toString('hex'),
      residentId: residents[0]._id,
      societyId: req.user.societyId,
      timestamp: Date.now()
    });

    const visitor = await Visitor.create({
      residentId: residents[0]._id,
      societyId: req.user.societyId,
      name,
      phone,
      purpose: purpose || 'personal',
      purposeDescription,
      numberOfVisitors: numberOfVisitors || 1,
      vehicleNumber: vehicleNumber || undefined,
      flatNo,
      block: block || residents[0].block,
      qrCode: qrCodeString,
      loggedBy: req.user.id,
      source: 'walk_in',
      approved: false,
      status: 'pending'
    });

    const io = req.app.get('io');
    if (io) {
      for (const resident of residents) {
        await notifyUser(io, resident._id, {
          societyId: req.user.societyId,
          type: 'visitor_approval',
          title: 'Visitor at the gate',
          sms: true,
          message: `${name} is at the gate for you. Approve or reject in Visitors.`,
          priority: 'high',
          relatedId: visitor._id,
          relatedModel: 'Visitor',
          actionUrl: '/visitors'
        });
      }
    }

    res.status(201).json({ success: true, visitor: present(visitor, req.user), message: 'Resident has been notified' });
  } catch (error) {
    console.error('Walk-in visitor error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/visitors/lookup/:code
// @desc    Find an invited visitor by the pass code printed under their QR code
// @access  Private (Security, Admins)
router.get('/lookup/:code', protect, authorize('security', 'guard_admin', 'society_admin', 'super_admin'), guessLimiter, async (req, res) => {
  try {
    const code = String(req.params.code || '').trim().toLowerCase();
    if (!/^[0-9a-f]{8,32}$/.test(code)) {
      return res.status(400).json({ success: false, message: 'Pass codes are 8 letters and digits (0-9, A-F).' });
    }

    const query = { qrCode: { $regex: `"visitorId":"${code}` } };
    if (req.user.role !== 'super_admin') query.societyId = req.user.societyId;

    const visitor = await Visitor.findOne(query).populate('residentId', 'name phone flatNo block').populate('approvedBy', 'name role').populate('loggedBy', 'name');
    if (!visitor) {
      return res.status(404).json({ success: false, message: 'No visitor found for that pass code' });
    }

    res.json({ success: true, visitor: { ...present(visitor, req.user), floor: floorOf(visitor.flatNo) } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
