const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Delivery = require('../models/Delivery');
const { protect, authorize, checkSocietyAccess } = require('../middleware/auth');
const { generateQRCode } = require('../utils/generateQR');
const { notifyUser } = require('../utils/notifyUser');
const { generateOTP, generateOTPExpiry } = require('../utils/generateOTP');
const crypto = require('crypto');

// @route   POST /api/deliveries/invite
// @desc    Invite a delivery
// @access  Private (Residents)
router.post('/invite', protect, authorize('resident'), [
  body('deliveryPersonName').trim().notEmpty().withMessage('Delivery person name is required'),
  body('deliveryPersonPhone').matches(/^[0-9]{10}$/).withMessage('Please provide a valid phone number'),
  body('items').isArray().withMessage('Items must be an array'),
  body('expectedArrival').optional().isISO8601().withMessage('Invalid date format')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      deliveryPersonName,
      deliveryPersonPhone,
      company,
      trackingNumber,
      items,
      expectedArrival,
      notes
    } = req.body;

    // Generate unique QR code
    const qrData = {
      deliveryId: crypto.randomBytes(16).toString('hex'),
      residentId: req.user.id,
      societyId: req.user.societyId,
      timestamp: Date.now()
    };
    const qrCodeString = JSON.stringify(qrData);

    // Generate OTP for delivery verification
    const otp = generateOTP();

    const delivery = await Delivery.create({
      residentId: req.user.id,
      societyId: req.user.societyId,
      deliveryPersonName,
      deliveryPersonPhone,
      company,
      trackingNumber,
      items,
      flatNo: req.user.flatNo,
      block: req.user.block,
      qrCode: qrCodeString,
      otp,
      otpExpires: generateOTPExpiry(30), // 30 minutes
      expectedArrival: expectedArrival ? new Date(expectedArrival) : null,
      notes,
      // Telling the app you expect a delivery is the approval; the guard can let the courier in.
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
      const Security = require('../models/User');
      const securityUsers = await Security.find({
        societyId: req.user.societyId,
        role: 'security'
      });

      for (const securityUser of securityUsers) {
        await notifyUser(io, securityUser._id, {
          societyId: req.user.societyId,
          type: 'delivery_approval',
          title: 'New Delivery Request',
          message: `${req.user.name} (${req.user.flatNo}) is expecting a delivery`,
          relatedId: delivery._id,
          relatedModel: 'Delivery',
          actionUrl: `/deliveries/${delivery._id}`
        });
      }
    }

    res.status(201).json({
      success: true,
      delivery: {
        ...delivery.toObject(),
        qrCodeImage,
        otp // Send OTP to resident (in production, send via SMS/email)
      },
      message: 'Delivery invitation sent successfully'
    });
  } catch (error) {
    console.error('Delivery invite error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/deliveries
// @desc    Get deliveries (filtered by role)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let query = {};

    if (req.user.role === 'resident') {
      query.residentId = req.user.id;
    } else if (req.user.role === 'super_admin') {
      // Super admin sees all deliveries
    } else if (['security', 'society_admin'].includes(req.user.role)) {
      query.societyId = req.user.societyId;
    }

    if (req.query.status) {
      query.status = req.query.status;
    }

    const deliveries = await Delivery.find(query)
      .populate('residentId', 'name email phone flatNo')
      .populate('approvedBy', 'name')
      .populate('receivedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(parseInt(req.query.limit) || 50)
      .skip(parseInt(req.query.skip) || 0);

    res.json({
      success: true,
      count: deliveries.length,
      deliveries
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/deliveries/:id
// @desc    Get single delivery
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const delivery = await Delivery.findById(req.params.id)
      .populate('residentId', 'name email phone flatNo')
      .populate('approvedBy', 'name')
      .populate('receivedBy', 'name');

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found'
      });
    }

    if (req.user.role === 'resident' && delivery.residentId._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this delivery'
      });
    }

    res.json({
      success: true,
      delivery
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   PUT /api/deliveries/:id/approve
// @desc    Approve delivery
// @access  Private (Residents, Security, Admins)
router.put('/:id/approve', protect, authorize('resident', 'security', 'society_admin'), async (req, res) => {
  try {
    const delivery = await Delivery.findById(req.params.id);

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found'
      });
    }

    if (req.user.role === 'resident' && delivery.residentId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to approve this delivery'
      });
    }

    delivery.approved = true;
    delivery.approvedBy = req.user.id;
    delivery.approvedAt = new Date();
    delivery.status = 'approved';
    delivery.rejected = false;

    await delivery.save();

    const io = req.app.get('io');
    if (io) {
      await notifyUser(io, delivery.residentId, {
        societyId: delivery.societyId,
        type: 'delivery_approval',
        title: 'Delivery Approved',
        message: `Your delivery has been approved`,
        relatedId: delivery._id,
        relatedModel: 'Delivery',
        actionUrl: `/deliveries/${delivery._id}`
      });
    }

    res.json({
      success: true,
      delivery,
      message: 'Delivery approved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   PUT /api/deliveries/:id/check-in
// @desc    Check in delivery
// @access  Private (Security)
router.put('/:id/check-in', protect, authorize('security', 'society_admin', 'super_admin'), [
  body('entryPhoto').optional().trim()
], async (req, res) => {
  try {
    const delivery = await Delivery.findById(req.params.id);

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found'
      });
    }

    if (!delivery.approved) {
      return res.status(400).json({
        success: false,
        message: 'Delivery must be approved before check-in'
      });
    }

    delivery.entryTime = new Date();
    delivery.status = 'in_transit';
    delivery.loggedBy = req.user.id;
    delivery.entryPhoto = req.body.entryPhoto || '';

    await delivery.save();

    const io = req.app.get('io');
    if (io) {
      await notifyUser(io, delivery.residentId, {
        societyId: delivery.societyId,
        type: 'delivery_entry',
        title: 'Delivery Arrived',
        message: `Your delivery has arrived at the gate`,
        relatedId: delivery._id,
        relatedModel: 'Delivery',
        actionUrl: `/deliveries/${delivery._id}`
      });
    }

    res.json({
      success: true,
      delivery,
      message: 'Delivery checked in successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   PUT /api/deliveries/:id/deliver
// @desc    Mark delivery as delivered
// @access  Private (Residents, Security)
router.put('/:id/deliver', protect, authorize('resident', 'security', 'society_admin', 'super_admin'), [
  body('otp').optional().trim()
], async (req, res) => {
  try {
    const delivery = await Delivery.findById(req.params.id);

    if (!delivery) {
      return res.status(404).json({
        success: false,
        message: 'Delivery not found'
      });
    }

    // Verify OTP if provided (for resident verification)
    if (req.user.role === 'resident' && req.body.otp) {
      if (delivery.otp !== req.body.otp) {
        return res.status(400).json({
          success: false,
          message: 'Invalid OTP'
        });
      }
      if (new Date() > delivery.otpExpires) {
        return res.status(400).json({
          success: false,
          message: 'OTP has expired'
        });
      }
    }

    delivery.receivedAt = new Date();
    delivery.receivedBy = req.user.id;
    delivery.status = 'delivered';
    delivery.exitTime = new Date();

    await delivery.save();

    res.json({
      success: true,
      delivery,
      message: 'Delivery marked as delivered'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;
