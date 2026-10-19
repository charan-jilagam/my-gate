const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Society = require('../models/Society');
const User = require('../models/User');
const { protect, authorize , scopeToOwnSociety } = require('../middleware/auth');
router.param('id', scopeToOwnSociety);

// @route   POST /api/societies
// @desc    Create a society
// @access  Private (Super Admin)
router.post('/', protect, authorize('super_admin'), [
  body('name').trim().notEmpty().withMessage('Society name is required'),
  body('address.street').trim().notEmpty().withMessage('Street address is required'),
  body('address.city').trim().notEmpty().withMessage('City is required'),
  body('address.state').trim().notEmpty().withMessage('State is required'),
  body('address.pincode').matches(/^[0-9]{6}$/).withMessage('Invalid pincode'),
  body('totalFlats').isInt({ min: 1 }).withMessage('Total flats must be a positive number'),
  body('contactNumber').matches(/^[0-9]{10}$/).withMessage('Invalid contact number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      name,
      address,
      blocks,
      totalFlats,
      contactNumber,
      email,
      logo,
      settings,
      amenities
    } = req.body;

    const society = await Society.create({
      name,
      address,
      blocks: blocks || [],
      totalFlats,
      contactNumber,
      email,
      logo,
      settings: settings || {},
      amenities: amenities || [],
      createdBy: req.user.id
    });

    res.status(201).json({
      success: true,
      society,
      message: 'Society created successfully'
    });
  } catch (error) {
    console.error('Society creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/societies/public
// @desc    Get society list for registration (public)
// @access  Public
router.get('/public', async (req, res) => {
  try {
    const societies = await Society.find({ isActive: true })
      .select('name _id address')
      .sort({ name: 1 });
    res.json({ success: true, societies });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/societies
// @desc    Get societies
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let query = {};

    // Super admin sees all, others see only their society
    if (req.user.role !== 'super_admin') {
      query._id = req.user.societyId;
    }

    const societies = await Society.find(query)
      .populate('admins', 'name email')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: societies.length,
      societies
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/societies/:id
// @desc    Get single society
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const society = await Society.findById(req.params.id)
      .populate('admins', 'name email phone')
      .populate('createdBy', 'name');

    if (!society) {
      return res.status(404).json({
        success: false,
        message: 'Society not found'
      });
    }

    // Check access
    if (req.user.role !== 'super_admin' && society._id.toString() !== req.user.societyId?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this society'
      });
    }

    res.json({
      success: true,
      society
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/societies/:id/staff
// @desc    Get society staff (for complaint assignment)
// @access  Private (Admins)
router.get('/:id/staff', protect, authorize('society_admin', 'super_admin'), async (req, res) => {
  try {
    const staff = await User.find({
      societyId: req.params.id,
      role: { $in: ['staff', 'vendor', 'society_admin'] }
    })
      .select('name email role')
      .sort({ name: 1 });
    res.json({ success: true, staff });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/societies/:id/residents
// @desc    Get society residents
// @access  Private (Admins)
router.get('/:id/residents', protect, authorize('society_admin', 'super_admin'), async (req, res) => {
  try {
    const society = await Society.findById(req.params.id);

    if (!society) {
      return res.status(404).json({
        success: false,
        message: 'Society not found'
      });
    }

    // Check access
    if (req.user.role === 'society_admin' && society._id.toString() !== req.user.societyId?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    const residents = await User.find({
      societyId: req.params.id,
      role: { $in: ['society_admin', 'resident', 'security', 'guard_admin', 'staff', 'vendor'] }
    })
      .select('name email phone role flatNo block isApproved isActive rejectedAt createdAt lastLogin')
      .sort({ role: 1, flatNo: 1 });

    res.json({
      success: true,
      count: residents.length,
      residents
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/societies/:id
// @desc    Update society
// @access  Private (Super Admin, Society Admin)
router.put('/:id', protect, authorize('super_admin', 'society_admin'), async (req, res) => {
  try {
    const society = await Society.findById(req.params.id);

    if (!society) {
      return res.status(404).json({
        success: false,
        message: 'Society not found'
      });
    }

    // Check access
    if (req.user.role === 'society_admin' && society._id.toString() !== req.user.societyId?.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    const allowedUpdates = [
      'name', 'address', 'blocks', 'totalFlats', 'contactNumber',
      'email', 'logo', 'settings', 'amenities'
    ];

    allowedUpdates.forEach(update => {
      if (req.body[update] !== undefined) {
        society[update] = req.body[update];
      }
    });

    await society.save();

    res.json({
      success: true,
      society,
      message: 'Society updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
