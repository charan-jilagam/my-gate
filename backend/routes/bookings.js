const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const Booking = require('../models/Booking');
const Society = require('../models/Society');
const User = require('../models/User');
const { protect, authorize, scopeToSociety } = require('../middleware/auth');
const { safeNotify, safeNotifyMany } = require('../utils/safeNotify');
const { DEFAULT_TZ, isValidDate, isValidTime, zonedToUtc, todayIn, addDays, toMinutes } = require('../utils/timezone');
const { buildDaySlots } = require('../utils/slots');
const { fail, invalid, serverError, isAdminRole } = require('../utils/routeKit');

router.param('id', scopeToSociety(Booking));

const ACTIVE = ['pending', 'approved'];
const MEMBERS = ['resident', 'society_admin', 'super_admin'];

// An amenity as a slot-engine "provider": open every day between its hours, nothing to wait for.
const asSchedule = (a) => ({
  weeklySchedule: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, enabled: true, start: a.openTime || '06:00', end: a.closeTime || '22:00' })),
  slotMinutes: a.slotMinutes || 60,
  breakTime: { enabled: false },
  timeOff: [],
  minNoticeMinutes: 0,
  maxAdvanceDays: a.maxAdvanceDays || 30,
  acceptingJobs: a.isActive !== false
});

const loadSociety = async (societyId) => {
  const society = await Society.findById(societyId).select('timezone amenities name');
  return society;
};

const findAmenity = (society, { amenityId, name }) => {
  const list = (society && society.amenities) || [];
  if (amenityId) return list.find((a) => String(a._id) === String(amenityId));
  const wanted = String(name || '').trim().toLowerCase();
  return list.find((a) => a.name.trim().toLowerCase() === wanted);
};

const presentAmenity = (a) => ({
  _id: a._id,
  name: a.name,
  description: a.description,
  capacity: a.capacity,
  hourlyRate: a.hourlyRate || 0,
  openTime: a.openTime || '06:00',
  closeTime: a.closeTime || '22:00',
  slotMinutes: a.slotMinutes || 60,
  maxSlotsPerBooking: a.maxSlotsPerBooking || 3,
  requiresApproval: a.requiresApproval !== false,
  maxAdvanceDays: a.maxAdvanceDays || 30
});

const overlapping = (amenity, societyId, startAt, endAt, exceptId) => {
  const filter = { amenity, societyId, status: { $in: ACTIVE }, startTime: { $lt: endAt }, endTime: { $gt: startAt } };
  if (exceptId) filter._id = { $ne: exceptId };
  return filter;
};

// @route   GET /api/bookings/amenities
// @desc    The spaces residents can book, with their hours and prices
router.get('/amenities', protect, authorize(...MEMBERS, 'security'), async (req, res) => {
  try {
    const societyId = req.user.role === 'super_admin' ? req.query.societyId : req.user.societyId;
    if (!societyId) return res.json({ success: true, amenities: [] });
    const society = await loadSociety(societyId);
    const amenities = ((society && society.amenities) || []).filter((a) => a.isActive !== false).map(presentAmenity);
    res.json({ success: true, amenities, timezone: (society && society.timezone) || DEFAULT_TZ });
  } catch (error) {
    serverError(res, error, 'List amenities');
  }
});

// @route   GET /api/bookings/availability?amenity=Clubhouse&date=2026-10-20
// @desc    Every slot of the day and whether it is free
router.get(
  '/availability',
  protect,
  authorize(...MEMBERS),
  [query('amenity').trim().notEmpty().withMessage('Choose an amenity'), query('date').custom(isValidDate).withMessage('Pick a valid date')],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      const societyId = req.user.role === 'super_admin' ? req.query.societyId : req.user.societyId;
      const society = await loadSociety(societyId);
      const amenity = findAmenity(society, { name: req.query.amenity });
      if (!amenity || amenity.isActive === false) return fail(res, 404, 'That amenity is not available.');

      const tz = society.timezone || DEFAULT_TZ;
      const dayStart = zonedToUtc(req.query.date, '00:00', tz);
      const dayEnd = zonedToUtc(addDays(req.query.date, 1), '00:00', tz);
      const bookings = await Booking.find({ amenity: amenity.name, societyId, status: { $in: ACTIVE }, startTime: { $gte: dayStart, $lt: dayEnd } }).select('startTime endTime');
      const day = buildDaySlots({
        date: req.query.date,
        provider: asSchedule(amenity),
        bookings: bookings.map((b) => ({ startAt: b.startTime, endAt: b.endTime })),
        now: new Date(),
        tz
      });
      res.json({ success: true, amenity: presentAmenity(amenity), ...day });
    } catch (error) {
      serverError(res, error, 'Amenity availability');
    }
  }
);

// @route   POST /api/bookings
// @desc    Book an amenity for a day and a start and end time in the society's time zone. The price is worked out here.
router.post(
  '/',
  protect,
  authorize('resident'),
  [
    body('amenity').optional().trim(),
    body('amenityId').optional().isMongoId().withMessage('Unknown amenity'),
    body('date').custom(isValidDate).withMessage('Pick a valid date'),
    body('startTime').custom(isValidTime).withMessage('Pick a start time like 18:00'),
    body('endTime').custom(isValidTime).withMessage('Pick an end time like 19:00'),
    body('numberOfGuests').optional().isInt({ min: 0, max: 500 }).withMessage('Guests must be 0 or more'),
    body('notes').optional().isString().isLength({ max: 300 }).withMessage('Keep the notes under 300 characters')
  ],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      const { amenityId, amenity: name, date, startTime, endTime, notes } = req.body;
      const guests = Number(req.body.numberOfGuests) || 0;
      if (!amenityId && !name) return fail(res, 400, 'Choose an amenity.');

      const society = await loadSociety(req.user.societyId);
      const amenity = findAmenity(society, { amenityId, name });
      if (!amenity || amenity.isActive === false) return fail(res, 404, 'That amenity is not available for booking.');
      if (amenity.capacity && guests + 1 > amenity.capacity) return fail(res, 400, `${amenity.name} fits ${amenity.capacity} people.`);

      const tz = society.timezone || DEFAULT_TZ;
      const step = amenity.slotMinutes || 60;
      const opens = toMinutes(amenity.openTime || '06:00');
      const closes = toMinutes(amenity.closeTime || '22:00');
      const from = toMinutes(startTime);
      const to = toMinutes(endTime);
      if (to <= from) return fail(res, 400, 'The end time must be after the start time.');
      if (from < opens || to > closes) return fail(res, 400, `${amenity.name} is open ${amenity.openTime || '06:00'} to ${amenity.closeTime || '22:00'}.`);
      if ((from - opens) % step !== 0 || (to - from) % step !== 0) return fail(res, 400, `Bookings are in ${step}-minute slots. Pick a slot from the list.`);
      if ((to - from) / step > (amenity.maxSlotsPerBooking || 3)) return fail(res, 400, `You can book at most ${amenity.maxSlotsPerBooking || 3} slots in a row.`);

      const now = new Date();
      const today = todayIn(tz, now);
      if (date < today) return fail(res, 400, 'That day has already passed.');
      if (date > addDays(today, amenity.maxAdvanceDays || 30)) return fail(res, 400, `You can book up to ${amenity.maxAdvanceDays || 30} days ahead.`);

      const startAt = zonedToUtc(date, startTime, tz);
      const endAt = zonedToUtc(date, endTime, tz);
      if (startAt <= now) return fail(res, 400, 'That time has already passed. Pick a later slot.');

      const taken = await Booking.findOne(overlapping(amenity.name, req.user.societyId, startAt, endAt));
      if (taken) return fail(res, 409, 'Someone just booked that time. Please pick another slot.');

      const hours = (to - from) / 60;
      const amount = Math.round(hours * (amenity.hourlyRate || 0) * 100) / 100;
      const auto = amenity.requiresApproval === false;

      const booking = await Booking.create({
        residentId: req.user.id,
        societyId: req.user.societyId,
        amenity: amenity.name,
        amenityId: amenity._id,
        dateStr: date,
        slotDate: zonedToUtc(date, '00:00', tz),
        startTime: startAt,
        endTime: endAt,
        numberOfGuests: guests,
        amount,
        notes,
        flatNo: req.user.flatNo,
        block: req.user.block,
        status: auto ? 'approved' : 'pending',
        approvedAt: auto ? now : undefined
      });

      // Two people can pass the check above at the same moment. The earlier booking keeps the slot.
      const earlier = await Booking.findOne({ ...overlapping(amenity.name, req.user.societyId, startAt, endAt), _id: { $lt: booking._id } });
      if (earlier) {
        await Booking.deleteOne({ _id: booking._id });
        return fail(res, 409, 'Someone just booked that time. Please pick another slot.');
      }

      const admins = await User.find({ societyId: req.user.societyId, role: 'society_admin', isActive: true }).select('_id');
      await safeNotifyMany(req.app.get('io'), admins.map((a) => a._id), {
        societyId: req.user.societyId,
        type: 'booking_request',
        title: auto ? 'New amenity booking' : 'Amenity booking needs approval',
        message: `${req.user.name} (${req.user.block ? `${req.user.block}-` : ''}${req.user.flatNo}) booked ${amenity.name} on ${date}, ${startTime} to ${endTime}`,
        relatedId: booking._id,
        relatedModel: 'Booking',
        actionUrl: '/bookings',
        priority: auto ? 'low' : 'medium'
      });

      res.status(201).json({
        success: true,
        booking,
        message: auto ? 'Booked. Your slot is confirmed.' : 'Request sent. You will be told when the office approves it.'
      });
    } catch (error) {
      if (error.name === 'ValidationError') return fail(res, 400, Object.values(error.errors)[0].message);
      return serverError(res, error, 'Create booking');
    }
  }
);

// @route   GET /api/bookings
router.get('/', protect, authorize(...MEMBERS, 'security'), async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'resident') filter.residentId = req.user.id;
    if (req.user.role !== 'super_admin') filter.societyId = req.user.societyId;
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.amenity) filter.amenity = String(req.query.amenity);
    if (req.query.upcoming === 'true') {
      filter.endTime = { $gte: new Date() };
      filter.status = { $in: ACTIVE };
    }

    const bookings = await Booking.find(filter)
      .populate('residentId', 'name flatNo block')
      .populate('approvedBy', 'name')
      .sort({ slotDate: -1, startTime: -1 })
      .limit(Math.min(parseInt(req.query.limit, 10) || 200, 500))
      .skip(parseInt(req.query.skip, 10) || 0);

    res.json({ success: true, count: bookings.length, bookings });
  } catch (error) {
    serverError(res, error, 'List bookings');
  }
});

const tell = (req, booking, data) =>
  safeNotify(req.app.get('io'), booking.residentId, {
    societyId: booking.societyId,
    relatedId: booking._id,
    relatedModel: 'Booking',
    actionUrl: '/bookings',
    ...data
  });

// @route   PUT /api/bookings/:id/approve
router.put('/:id/approve', protect, authorize('society_admin', 'super_admin'), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return fail(res, 404, 'Booking not found');
    if (booking.status !== 'pending') return fail(res, 409, `This booking is already ${booking.status}.`);
    if (booking.endTime <= new Date()) return fail(res, 400, 'This slot has already passed.');

    // Do not confirm two bookings for the same time.
    const clash = await Booking.findOne({ ...overlapping(booking.amenity, booking.societyId, booking.startTime, booking.endTime, booking._id), status: 'approved' });
    if (clash) return fail(res, 409, 'Another booking is already approved for this time. Reject this one instead.');

    booking.status = 'approved';
    booking.approvedBy = req.user.id;
    booking.approvedAt = new Date();
    await booking.save();

    await tell(req, booking, { type: 'booking_approved', title: 'Booking approved', message: `Your ${booking.amenity} booking is confirmed.` });
    res.json({ success: true, booking, message: 'Booking approved' });
  } catch (error) {
    serverError(res, error, 'Approve booking');
  }
});

// @route   PUT /api/bookings/:id/reject
router.put('/:id/reject', protect, authorize('society_admin', 'super_admin'), [body('reason').optional().isString().isLength({ max: 200 })], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return fail(res, 404, 'Booking not found');
    if (!ACTIVE.includes(booking.status)) return fail(res, 409, `This booking is already ${booking.status}.`);

    booking.status = 'rejected';
    booking.rejectedReason = (req.body.reason || '').trim() || 'No reason given';
    await booking.save();

    await tell(req, booking, { type: 'booking_rejected', title: 'Booking not approved', message: `Your ${booking.amenity} booking was not approved: ${booking.rejectedReason}`, priority: 'high' });
    res.json({ success: true, booking, message: 'Booking rejected' });
  } catch (error) {
    serverError(res, error, 'Reject booking');
  }
});

// @route   PUT /api/bookings/:id/cancel
router.put('/:id/cancel', protect, authorize('resident', 'society_admin', 'super_admin'), [body('reason').optional().isString().isLength({ max: 200 })], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return fail(res, 404, 'Booking not found');

    const byAdmin = isAdminRole(req.user);
    if (!byAdmin && String(booking.residentId) !== String(req.user.id)) return fail(res, 403, 'You can only cancel your own bookings.');
    if (!ACTIVE.includes(booking.status)) return fail(res, 400, 'This booking cannot be cancelled.');
    if (booking.startTime <= new Date()) return fail(res, 400, 'This booking has already started.');

    booking.status = 'cancelled';
    booking.cancellationReason = (req.body.reason || '').trim() || (byAdmin ? 'Cancelled by the society office' : 'Cancelled by resident');
    booking.cancelledAt = new Date();
    await booking.save();

    if (byAdmin) {
      await tell(req, booking, { type: 'booking_rejected', title: 'Booking cancelled', message: `Your ${booking.amenity} booking was cancelled: ${booking.cancellationReason}`, priority: 'high' });
    } else {
      const admins = await User.find({ societyId: booking.societyId, role: 'society_admin', isActive: true }).select('_id');
      await safeNotifyMany(req.app.get('io'), admins.map((a) => a._id), {
        societyId: booking.societyId,
        type: 'booking_request',
        title: 'Booking cancelled',
        message: `${req.user.name} cancelled ${booking.amenity} on ${booking.dateStr || ''}`.trim(),
        relatedId: booking._id,
        relatedModel: 'Booking',
        actionUrl: '/bookings',
        priority: 'low'
      });
    }
    res.json({ success: true, booking, message: 'Booking cancelled' });
  } catch (error) {
    serverError(res, error, 'Cancel booking');
  }
});

module.exports = router;
