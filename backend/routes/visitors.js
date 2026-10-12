const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Visitor = require('../models/Visitor');
const { protect, authorize, checkSocietyAccess } = require('../middleware/auth');
const { generateQRCode } = require('../utils/generateQR');
const { notifyUser } = require('../utils/notifyUser');
const crypto = require('crypto');

// @route   POST /api/visitors/invite
// @desc    Invite a visitor
// @access  Private (Residents)
router.post('/invite', protect, authorize('resident'), [
  body('name').trim().notEmpty().withMessage('Visitor name is required'),
  body('phone').matches(/^[0-9]{10}$/).withMessage('Please provide a valid phone number'),
  body('purpose').isIn(['personal', 'business', 'delivery', 'service', 'other']).withMessage('Invalid purpose'),
  body('expectedArrival').optional().isISO8601().withMessage('Invalid date format')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      name,
      phone,
      email,
      purpose,
      purposeDescription,
      numberOfVisitors,
      vehicleNumber,
      expectedArrival,
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
      expectedArrival: expectedArrival ? new Date(expectedArrival) : null,
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

    res.status(201).json({
      success: true,
      visitor: {
        ...visitor.toObject(),
        qrCodeImage
      },
      message: 'Visitor invitation sent successfully'
    });
  } catch (error) {
    console.error('Visitor invite error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
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
    else if (['security', 'society_admin'].includes(req.user.role)) {
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
      .populate('approvedBy', 'name')
      .populate('loggedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(parseInt(req.query.limit) || 50)
      .skip(parseInt(req.query.skip) || 0);

    res.json({
      success: true,
      count: visitors.length,
      visitors
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
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
      .populate('approvedBy', 'name')
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
      visitor
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   PUT /api/visitors/:id/approve
// @desc    Approve visitor
// @access  Private (Residents, Security, Admins)
router.put('/:id/approve', protect, authorize('resident', 'security', 'society_admin'), async (req, res) => {
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
      visitor,
      message: 'Visitor approved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   PUT /api/visitors/:id/reject
// @desc    Reject visitor
// @access  Private (Residents, Security, Admins)
router.put('/:id/reject', protect, authorize('resident', 'security', 'society_admin'), [
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
      visitor,
      message: 'Visitor rejected'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   PUT /api/visitors/:id/check-in
// @desc    Check in visitor
// @access  Private (Security)
router.put('/:id/check-in', protect, authorize('security', 'society_admin', 'super_admin'), [
  body('entryPhoto').optional().trim()
], async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id);

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: 'Visitor not found'
      });
    }

    if (!visitor.approved) {
      return res.status(400).json({
        success: false,
        message: 'Visitor must be approved before check-in'
      });
    }

    visitor.entryTime = new Date();
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
        message: `${visitor.name} has checked in`,
        relatedId: visitor._id,
        relatedModel: 'Visitor',
        actionUrl: `/visitors/${visitor._id}`
      });
    }

    res.json({
      success: true,
      visitor,
      message: 'Visitor checked in successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   PUT /api/visitors/:id/check-out
// @desc    Check out visitor
// @access  Private (Security)
router.put('/:id/check-out', protect, authorize('security', 'society_admin', 'super_admin'), [
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

    visitor.exitTime = new Date();
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
      visitor,
      message: 'Visitor checked out successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/visitors/logs/today
// @desc    Get today's visitor logs
// @access  Private (Security, Admins)
router.get('/logs/today', protect, authorize('security', 'society_admin', 'super_admin'), async (req, res) => {
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
      visitors
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   POST /api/visitors/walk-in
// @desc    Guard logs an unannounced visitor; the resident gets a live request to approve or reject
// @access  Private (Security, Admins)
router.post('/walk-in', protect, authorize('security', 'society_admin'), [
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
    const residents = await User.find(residentQuery);

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
          message: `${name} is at the gate for you. Approve or reject in Visitors.`,
          priority: 'high',
          relatedId: visitor._id,
          relatedModel: 'Visitor',
          actionUrl: '/visitors'
        });
      }
    }

    res.status(201).json({ success: true, visitor, message: 'Resident has been notified' });
  } catch (error) {
    console.error('Walk-in visitor error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/visitors/lookup/:code
// @desc    Find an invited visitor by the pass code printed under their QR code
// @access  Private (Security, Admins)
router.get('/lookup/:code', protect, authorize('security', 'society_admin', 'super_admin'), async (req, res) => {
  try {
    const code = String(req.params.code || '').trim().toLowerCase();
    if (!/^[0-9a-f]{6,32}$/.test(code)) {
      return res.status(400).json({ success: false, message: 'Pass codes are 6 or more letters and digits (0-9, A-F).' });
    }

    const query = { qrCode: { $regex: `"visitorId":"${code}` } };
    if (req.user.role !== 'super_admin') query.societyId = req.user.societyId;

    const visitor = await Visitor.findOne(query).populate('residentId', 'name phone flatNo block');
    if (!visitor) {
      return res.status(404).json({ success: false, message: 'No visitor found for that pass code' });
    }

    res.json({ success: true, visitor });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
