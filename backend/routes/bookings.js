const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Booking = require('../models/Booking');
const Society = require('../models/Society');
const { protect, authorize , scopeToSociety } = require('../middleware/auth');
router.param('id', scopeToSociety(require('../models/Booking')));
const { notifyUser } = require('../utils/notifyUser');

// @route   POST /api/bookings
// @desc    Create a booking
// @access  Private (Residents)
router.post('/', protect, authorize('resident'), [
  body('amenity').trim().notEmpty().withMessage('Amenity name is required'),
  body('slotDate').isISO8601().withMessage('Invalid date format'),
  body('startTime').isISO8601().withMessage('Invalid start time'),
  body('endTime').isISO8601().withMessage('Invalid end time')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      amenity,
      amenityId,
      slotDate,
      startTime,
      endTime,
      numberOfGuests,
      notes
    } = req.body;

    const start = new Date(startTime);
    const end = new Date(endTime);

    // Check for conflicts
    const conflictingBooking = await Booking.findOne({
      amenity,
      societyId: req.user.societyId,
      status: { $in: ['pending', 'approved'] },
      $or: [
        {
          startTime: { $lt: end },
          endTime: { $gt: start }
        }
      ]
    });

    if (conflictingBooking) {
      return res.status(400).json({
        success: false,
        message: 'Time slot already booked'
      });
    }

    // Get amenity details for pricing
    const society = await Society.findById(req.user.societyId);
    const amenityDetails = society.amenities.find(a => a._id.toString() === amenityId);
    let amount = 0;
    if (amenityDetails && amenityDetails.hourlyRate) {
      const hours = (end - start) / (1000 * 60 * 60);
      amount = hours * amenityDetails.hourlyRate;
    }

    const booking = await Booking.create({
      residentId: req.user.id,
      societyId: req.user.societyId,
      amenity,
      amenityId,
      slotDate: new Date(slotDate),
      startTime: start,
      endTime: end,
      numberOfGuests: numberOfGuests || 0,
      amount,
      notes,
      flatNo: req.user.flatNo,
      block: req.user.block,
      status: 'pending'
    });

    // Notify admins
    const io = req.app.get('io');
    if (io) {
      const User = require('../models/User');
      const admins = await User.find({
        societyId: req.user.societyId,
        role: { $in: ['society_admin', 'super_admin'] }
      });

      for (const admin of admins) {
        await notifyUser(io, admin._id, {
          societyId: req.user.societyId,
          type: 'booking_approved',
          title: 'New Amenity Booking',
          message: `${req.user.name} (${req.user.flatNo}) booked ${amenity}`,
          relatedId: booking._id,
          relatedModel: 'Booking',
          actionUrl: `/bookings/${booking._id}`
        });
      }
    }

    res.status(201).json({
      success: true,
      booking,
      message: 'Booking created successfully'
    });
  } catch (error) {
    console.error('Booking creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/bookings
// @desc    Get bookings
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let query = {};

    if (req.user.role === 'resident') {
      query.residentId = req.user.id;
    } else if (['society_admin', 'super_admin'].includes(req.user.role)) {
      query.societyId = req.user.societyId;
    }

    if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.query.amenity) {
      query.amenity = req.query.amenity;
    }

    if (req.user.role !== 'super_admin') query.societyId = req.user.societyId;

    const bookings = await Booking.find(query)
      .populate('residentId', 'name flatNo')
      .populate('approvedBy', 'name')
      .sort({ slotDate: -1, startTime: -1 })
      .limit(Math.min(parseInt(req.query.limit) || 200, 500))
      .skip(parseInt(req.query.skip) || 0);

    res.json({
      success: true,
      count: bookings.length,
      bookings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/bookings/availability
// @desc    Check amenity availability
// @access  Private
router.get('/availability', protect, [
  body('amenity').trim().notEmpty(),
  body('date').isISO8601()
], async (req, res) => {
  try {
    const { amenity, date } = req.query;

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const bookings = await Booking.find({
      amenity,
      societyId: req.user.societyId,
      slotDate: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['pending', 'approved'] }
    }).select('startTime endTime');

    res.json({
      success: true,
      bookings,
      message: 'Availability fetched successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/bookings/:id/approve
// @desc    Approve booking
// @access  Private (Admins)
router.put('/:id/approve', protect, authorize('society_admin', 'super_admin'), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    booking.status = 'approved';
    booking.approvedBy = req.user.id;
    booking.approvedAt = new Date();

    await booking.save();

    // Notify resident
    const io = req.app.get('io');
    if (io) {
      await notifyUser(io, booking.residentId, {
        societyId: booking.societyId,
        type: 'booking_approved',
        title: 'Booking Approved',
        message: `Your ${booking.amenity} booking has been approved`,
        relatedId: booking._id,
        relatedModel: 'Booking',
        actionUrl: `/bookings/${booking._id}`
      });
    }

    res.json({
      success: true,
      booking,
      message: 'Booking approved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/bookings/:id/reject
// @desc    Reject booking
// @access  Private (Admins)
router.put('/:id/reject', protect, authorize('society_admin', 'super_admin'), [
  body('reason').optional().trim()
], async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    booking.status = 'rejected';
    booking.rejectedReason = req.body.reason || 'No reason provided';

    await booking.save();

    // Notify resident
    const io = req.app.get('io');
    if (io) {
      await notifyUser(io, booking.residentId, {
        societyId: booking.societyId,
        type: 'booking_rejected',
        title: 'Booking Rejected',
        message: `Your ${booking.amenity} booking has been rejected`,
        relatedId: booking._id,
        relatedModel: 'Booking',
        actionUrl: `/bookings/${booking._id}`
      });
    }

    res.json({
      success: true,
      booking,
      message: 'Booking rejected'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   PUT /api/bookings/:id/cancel
// @desc    Cancel booking
// @access  Private (Residents)
router.put('/:id/cancel', protect, authorize('resident'), [
  body('reason').optional().trim()
], async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found'
      });
    }

    if (booking.residentId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this booking'
      });
    }

    if (['cancelled', 'completed'].includes(booking.status)) {
      return res.status(400).json({
        success: false,
        message: 'Booking cannot be cancelled'
      });
    }

    booking.status = 'cancelled';
    booking.cancellationReason = req.body.reason || 'Cancelled by resident';
    booking.cancelledAt = new Date();

    await booking.save();

    res.json({
      success: true,
      booking,
      message: 'Booking cancelled successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
