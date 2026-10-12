const express = require('express');
const { cleanImages } = require('../utils/imageUrl');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Complaint = require('../models/Complaint');
const { protect, authorize, checkSocietyAccess , scopeToSociety } = require('../middleware/auth');
router.param('id', scopeToSociety(require('../models/Complaint')));
const { notifyUser } = require('../utils/notifyUser');
const User = require('../models/User');

// @route   POST /api/complaints
// @desc    Create a complaint
// @access  Private (Residents)
router.post('/', protect, authorize('resident'), [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('category').isIn(['maintenance', 'security', 'cleaning', 'amenities', 'billing', 'noise', 'parking', 'other']).withMessage('Invalid category'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      title,
      description,
      category,
      priority,
      images,
      location,
      isPublic
    } = req.body;

    const complaint = await Complaint.create({
      residentId: req.user.id,
      societyId: req.user.societyId,
      title,
      description,
      category,
      priority: priority || 'medium',
      images: cleanImages(images),
      location,
      flatNo: req.user.flatNo,
      block: req.user.block,
      isPublic: isPublic || false,
      status: 'open'
    });

    // Notify admins
    const io = req.app.get('io');
    if (io) {
      const admins = await User.find({
        societyId: req.user.societyId,
        role: { $in: ['society_admin', 'super_admin'] }
      });

      for (const admin of admins) {
        await notifyUser(io, admin._id, {
          societyId: req.user.societyId,
          type: 'complaint_update',
          title: 'New Complaint',
          message: `${req.user.name} (${req.user.flatNo}) submitted a complaint: ${title}`,
          relatedId: complaint._id,
          relatedModel: 'Complaint',
          actionUrl: `/complaints/${complaint._id}`,
          priority: 'high'
        });
      }
    }

    res.status(201).json({
      success: true,
      complaint,
      message: 'Complaint submitted successfully'
    });
  } catch (error) {
    console.error('Complaint creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/complaints
// @desc    Get complaints
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let query = {};

    if (req.user.role === 'resident') {
      query.residentId = req.user.id;
    } else if (req.user.role === 'super_admin') {
      // Super admin sees all complaints
    } else if (req.user.role === 'society_admin') {
      query.societyId = req.user.societyId;
    } else if (req.user.role === 'staff') {
      query.$or = [
        { assignedTo: req.user.id },
        { societyId: req.user.societyId, isPublic: true }
      ];
    }

    if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.query.category) {
      query.category = req.query.category;
    }

    if (req.user.role !== 'super_admin') query.societyId = req.user.societyId;

    const complaints = await Complaint.find(query)
      .populate('residentId', 'name email phone flatNo')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(req.query.limit) || 200, 500))
      .skip(parseInt(req.query.skip) || 0);

    res.json({
      success: true,
      count: complaints.length,
      complaints
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/complaints/:id
// @desc    Get single complaint
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id)
      .populate('residentId', 'name email phone flatNo')
      .populate('assignedTo', 'name email')
      .populate('updates.updatedBy', 'name');

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }

    // Check access
    if (req.user.role === 'resident' && complaint.residentId._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this complaint'
      });
    }

    res.json({
      success: true,
      complaint
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/complaints/:id/assign
// @desc    Assign complaint to staff
// @access  Private (Admins)
router.put('/:id/assign', protect, authorize('society_admin', 'super_admin'), [
  body('assignedTo').notEmpty().withMessage('Staff ID is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }

    const staff = await User.findById(req.body.assignedTo);
    if (!staff || !['staff', 'vendor'].includes(staff.role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid staff member'
      });
    }

    complaint.assignedTo = req.body.assignedTo;
    complaint.assignedAt = new Date();
    complaint.status = 'in_progress';

    complaint.updates.push({
      message: `Complaint assigned to ${staff.name}`,
      updatedBy: req.user.id
    });

    await complaint.save();

    // Notify assigned staff
    const io = req.app.get('io');
    if (io) {
      await notifyUser(io, staff._id, {
        societyId: complaint.societyId,
        type: 'complaint_assigned',
        title: 'Complaint Assigned',
        message: `You have been assigned a complaint: ${complaint.title}`,
        relatedId: complaint._id,
        relatedModel: 'Complaint',
        actionUrl: `/complaints/${complaint._id}`,
        priority: 'high'
      });

      await notifyUser(io, complaint.residentId, {
        societyId: complaint.societyId,
        type: 'complaint_update',
        title: 'Complaint Assigned',
        message: `Your complaint has been assigned to ${staff.name}`,
        relatedId: complaint._id,
        relatedModel: 'Complaint',
        actionUrl: `/complaints/${complaint._id}`
      });
    }

    res.json({
      success: true,
      complaint,
      message: 'Complaint assigned successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/complaints/:id/status
// @desc    Update complaint status
// @access  Private (Admins, Staff)
router.put('/:id/status', protect, authorize('society_admin', 'super_admin', 'staff'), [
  body('status').isIn(['open', 'in_progress', 'resolved', 'closed', 'rejected']).withMessage('Invalid status'),
  body('resolution').optional().trim(),
  body('message').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }

    // Check if staff member is assigned to this complaint
    if (req.user.role === 'staff' && complaint.assignedTo?.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this complaint'
      });
    }

    const oldStatus = complaint.status;
    complaint.status = req.body.status;

    if (req.body.status === 'resolved' || req.body.status === 'closed') {
      complaint.resolvedAt = new Date();
      complaint.resolution = req.body.resolution || complaint.resolution;
    }

    if (req.body.message) {
      complaint.updates.push({
        message: req.body.message,
        updatedBy: req.user.id,
        attachments: req.body.attachments || []
      });
    }

    await complaint.save();

    // Notify resident
    const io = req.app.get('io');
    if (io) {
      await notifyUser(io, complaint.residentId, {
        societyId: complaint.societyId,
        type: 'complaint_update',
        title: 'Complaint Status Updated',
        message: `Your complaint status changed from ${oldStatus} to ${req.body.status}`,
        relatedId: complaint._id,
        relatedModel: 'Complaint',
        actionUrl: `/complaints/${complaint._id}`
      });
    }

    res.json({
      success: true,
      complaint,
      message: 'Complaint status updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/complaints/:id/feedback
// @desc    Resident rates how a complaint was handled
// @access  Private (Residents, own complaints)
router.put('/:id/feedback', protect, authorize('resident'), [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Choose a rating from 1 to 5'),
  body('feedback').optional().trim().isLength({ max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found' });
    if (complaint.residentId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (!['resolved', 'closed'].includes(complaint.status)) {
      return res.status(400).json({ success: false, message: 'You can rate a complaint once it is resolved' });
    }

    complaint.rating = Number(req.body.rating);
    complaint.feedback = req.body.feedback || undefined;
    await complaint.save();

    res.json({ success: true, complaint, message: 'Thanks for your feedback' });
  } catch (error) {
    console.error('Complaint feedback error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/complaints/:id/update
// @desc    Add update to complaint
// @access  Private
router.post('/:id/update', protect, [
  body('message').trim().notEmpty().withMessage('Message is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: 'Complaint not found'
      });
    }

    // Check access
    const canUpdate = 
      complaint.residentId.toString() === req.user.id ||
      complaint.assignedTo?.toString() === req.user.id ||
      ['society_admin', 'super_admin'].includes(req.user.role);

    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this complaint'
      });
    }

    complaint.updates.push({
      message: req.body.message,
      updatedBy: req.user.id,
      attachments: req.body.attachments || []
    });

    await complaint.save();

    // Notify relevant users
    const io = req.app.get('io');
    if (io) {
      const notifyIds = [complaint.residentId];
      if (complaint.assignedTo) {
        notifyIds.push(complaint.assignedTo);
      }

      for (const userId of notifyIds) {
        if (userId.toString() !== req.user.id) {
          await notifyUser(io, userId, {
            societyId: complaint.societyId,
            type: 'complaint_update',
            title: 'Complaint Update',
            message: req.body.message.substring(0, 100),
            relatedId: complaint._id,
            relatedModel: 'Complaint',
            actionUrl: `/complaints/${complaint._id}`
          });
        }
      }
    }

    res.json({
      success: true,
      complaint,
      message: 'Update added successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
