const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Notice = require('../models/Notice');
const { protect, authorize, checkSocietyAccess , scopeToSociety } = require('../middleware/auth');
router.param('id', scopeToSociety(require('../models/Notice')));
const { notifyUsers } = require('../utils/notifyUser');
const User = require('../models/User');

// A flat can be written as "101" or "A-101"; both match a resident in block A, flat 101.
const matchesFlat = (user, flats) => {
  const flat = String(user.flatNo || '').toUpperCase();
  const full = `${String(user.block || '').toUpperCase()}-${flat}`;
  return flats.includes(flat) || flats.includes(full);
};

// @route   POST /api/notices
// @desc    Create a notice
// @access  Private (Admins)
router.post('/', protect, authorize('society_admin', 'super_admin'), [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('content').trim().notEmpty().withMessage('Content is required'),
  body('type').isIn(['notice', 'announcement', 'poll', 'event', 'maintenance']).withMessage('Invalid notice type'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('targetAudience').optional().isIn(['all', 'residents', 'owners', 'tenants', 'specific_blocks', 'specific_flats']),
  body('targetBlocks').optional().isArray({ max: 50 }),
  body('targetFlats').optional().isArray({ max: 500 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      title,
      content,
      type,
      priority,
      category,
      attachments,
      targetAudience,
      targetBlocks,
      targetFlats,
      pollOptions,
      pollEndDate,
      eventDate,
      eventLocation,
      expiresAt,
      societyId: bodySocietyId
    } = req.body;

    const clean = (list) => [...new Set((Array.isArray(list) ? list : []).map((x) => String(x).trim().toUpperCase()).filter(Boolean))];
    const blocks = targetAudience === 'specific_blocks' ? clean(targetBlocks) : [];
    const flats = targetAudience === 'specific_flats' ? clean(targetFlats) : [];
    if (targetAudience === 'specific_blocks' && !blocks.length) {
      return res.status(400).json({ success: false, message: 'Enter at least one block' });
    }
    if (targetAudience === 'specific_flats' && !flats.length) {
      return res.status(400).json({ success: false, message: 'Enter at least one flat' });
    }

    const societyId = req.user.role === 'super_admin' ? bodySocietyId : req.user.societyId;
    if (!societyId) {
      return res.status(400).json({ success: false, message: 'Society is required' });
    }

    const notice = await Notice.create({
      societyId,
      title,
      content,
      type,
      priority: priority || 'medium',
      category: category || 'general',
      attachments: attachments || [],
      targetAudience: targetAudience || 'all',
      targetBlocks: blocks,
      targetFlats: flats,
      pollOptions: type === 'poll' ? pollOptions : undefined,
      pollEndDate: pollEndDate ? new Date(pollEndDate) : undefined,
      eventDate: eventDate ? new Date(eventDate) : undefined,
      eventLocation,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      createdBy: req.user.id,
      isPublished: true,
      publishedAt: new Date()
    });

    // Notify all relevant users
    const io = req.app.get('io');
    if (io) {
      // Residents of the society, narrowed by block or flat when the notice is targeted.
      let targetUsers = await User.find({ societyId, role: 'resident', isApproved: true, isActive: true }).select('_id block flatNo');
      if (targetAudience === 'specific_blocks') {
        targetUsers = targetUsers.filter((u) => blocks.includes(String(u.block || '').toUpperCase()));
      } else if (targetAudience === 'specific_flats') {
        targetUsers = targetUsers.filter((u) => matchesFlat(u, flats));
      }

      const userIds = targetUsers.map(u => u._id);
      await notifyUsers(io, userIds, {
        societyId,
        type: 'notice_published',
        title: `New ${type}: ${title}`,
        message: content.substring(0, 100) + '...',
        relatedId: notice._id,
        relatedModel: 'Notice',
        actionUrl: `/notices/${notice._id}`,
        priority: priority || 'medium'
      });
    }

    res.status(201).json({
      success: true,
      notice,
      message: 'Notice created and published successfully'
    });
  } catch (error) {
    console.error('Notice creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/notices
// @desc    Get notices
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let query = {
      isPublished: true,
      isActive: true
    };

    // Super admin sees all notices, others see only their society
    if (req.user.role !== 'super_admin') {
      query.societyId = req.user.societyId;
    }

    // Not expired, and (for residents) meant for them: everyone, their block, or their flat.
    query.$and = [
      {
        $or: [
          { expiresAt: { $exists: false } },
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ]
      }
    ];

    if (req.query.type) {
      query.type = req.query.type;
    }

    if (req.query.category) {
      query.category = req.query.category;
    }

    if (req.user.role === 'resident') {
      const block = String(req.user.block || '').toUpperCase();
      const flat = String(req.user.flatNo || '').toUpperCase();
      query.$and.push({
        $or: [
          { targetAudience: { $in: ['all', 'residents', 'owners', 'tenants'] } },
          { targetAudience: 'specific_blocks', targetBlocks: block },
          { targetAudience: 'specific_flats', targetFlats: { $in: [flat, `${block}-${flat}`] } }
        ]
      });
    }

    if (req.user.role !== 'super_admin') query.societyId = req.user.societyId;

    const notices = await Notice.find(query)
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(req.query.limit) || 200, 500))
      .skip(parseInt(req.query.skip) || 0);

    res.json({
      success: true,
      count: notices.length,
      notices
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/notices/:id
// @desc    Get single notice
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id)
      .populate('createdBy', 'name');

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: 'Notice not found'
      });
    }

    // Record view if resident
    if (req.user.role === 'resident') {
      const hasViewed = notice.views.some(
        v => v.userId.toString() === req.user.id
      );
      if (!hasViewed) {
        notice.views.push({
          userId: req.user.id,
          viewedAt: new Date()
        });
        await notice.save();
      }
    }

    res.json({
      success: true,
      notice
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/notices/:id/vote
// @desc    Vote on a poll
// @access  Private (Residents)
router.post('/:id/vote', protect, authorize('resident'), [
  body('optionIndex').isInt({ min: 0 }).withMessage('Invalid option index')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const notice = await Notice.findById(req.params.id);

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: 'Notice not found'
      });
    }

    if (notice.type !== 'poll') {
      return res.status(400).json({
        success: false,
        message: 'This notice is not a poll'
      });
    }

    if (notice.pollEndDate && new Date() > notice.pollEndDate) {
      return res.status(400).json({
        success: false,
        message: 'Poll has ended'
      });
    }

    const optionIndex = req.body.optionIndex;
    if (optionIndex >= notice.pollOptions.length) {
      return res.status(400).json({
        success: false,
        message: 'Invalid option index'
      });
    }

    // Check if user already voted
    const hasVoted = notice.pollOptions.some(option =>
      option.votes.some(v => v.toString() === req.user.id)
    );

    if (hasVoted) {
      return res.status(400).json({
        success: false,
        message: 'You have already voted'
      });
    }

    // Add vote
    notice.pollOptions[optionIndex].votes.push(req.user.id);
    await notice.save();

    res.json({
      success: true,
      notice,
      message: 'Vote recorded successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/notices/:id
// @desc    Update notice
// @access  Private (Admins)
router.put('/:id', protect, authorize('society_admin', 'super_admin'), async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: 'Notice not found'
      });
    }

    const allowedUpdates = [
      'title', 'content', 'priority', 'category', 'attachments',
      'pollOptions', 'pollEndDate', 'eventDate', 'eventLocation', 'expiresAt'
    ];

    allowedUpdates.forEach(update => {
      if (req.body[update] !== undefined) {
        if (update.includes('Date')) {
          notice[update] = req.body[update] ? new Date(req.body[update]) : null;
        } else {
          notice[update] = req.body[update];
        }
      }
    });

    await notice.save();

    res.json({
      success: true,
      notice,
      message: 'Notice updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   DELETE /api/notices/:id
// @desc    Delete notice
// @access  Private (Admins)
router.delete('/:id', protect, authorize('society_admin', 'super_admin'), async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id);

    if (!notice) {
      return res.status(404).json({
        success: false,
        message: 'Notice not found'
      });
    }

    notice.isActive = false;
    await notice.save();

    res.json({
      success: true,
      message: 'Notice deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
