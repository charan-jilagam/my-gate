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
const { fail, invalid, serverError, isAdminRole, paging } = require('../utils/routeKit');

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
router.get('/amenities', protect, authorize(...MEMBERS, 'security', 'guard_admin'), async (req, res) => {
  try {
    const societyId = req.user.role === 'super_admin' ? req.query.societyId : req.user.societyId;
    if (!societyId) return res.json({ success: true, amenities: [] });
    const society = await loadSociety(societyId);
    // Admins managing the list also see the closed ones.
    const everything = req.query.all === '1' && isAdminRole(req.user);
    const amenities = ((society && society.amenities) || []).filter((a) => everything || a.isActive !== false).map((a) => ({ ...presentAmenity(a), isActive: a.isActive !== false }));
    res.json({ success: true, amenities, timezone: (society && society.timezone) || DEFAULT_TZ });
  } catch (error) {
    serverError(res, error, 'List amenities');
  }
});

const amenityRules = () => [
  body('name').trim().notEmpty().withMessage('Give the amenity a name').isLength({ max: 60 }).withMessage('Keep the name under 60 characters'),
  body('description').optional({ nullable: true }).trim().isLength({ max: 300 }).withMessage('Keep the description under 300 characters'),
  body('capacity').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1, max: 5000 }).withMessage('Capacity must be 1 or more'),
  body('hourlyRate').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0, max: 100000 }).withMessage('The hourly price must be 0 or more'),
  body('openTime').optional().custom(isValidTime).withMessage('Opening time must look like 06:00'),
  body('closeTime').optional().custom(isValidTime).withMessage('Closing time must look like 22:00'),
  body('slotMinutes').optional().isIn([30, 60, 90, 120]).withMessage('Slot length must be 30, 60, 90 or 120 minutes'),
  body('maxSlotsPerBooking').optional().isInt({ min: 1, max: 12 }).withMessage('Slots in a row must be 1 to 12'),
  body('maxAdvanceDays').optional().isInt({ min: 1, max: 90 }).withMessage('Booking ahead must be 1 to 90 days')
];

const pickAmenity = (b) => {
  const out = {};
  if (b.name !== undefined) out.name = String(b.name).trim();
  if (b.description !== undefined) out.description = String(b.description || '').trim();
  if (b.capacity !== undefined) out.capacity = b.capacity === '' || b.capacity === null ? undefined : Number(b.capacity);
  if (b.hourlyRate !== undefined) out.hourlyRate = b.hourlyRate === '' || b.hourlyRate === null ? 0 : Number(b.hourlyRate);
  ['openTime', 'closeTime'].forEach((k) => { if (b[k] !== undefined) out[k] = b[k]; });
  ['slotMinutes', 'maxSlotsPerBooking', 'maxAdvanceDays'].forEach((k) => { if (b[k] !== undefined) out[k] = Number(b[k]); });
  ['requiresApproval', 'isActive'].forEach((k) => { if (b[k] !== undefined) out[k] = !!b[k]; });
  return out;
};

const sameName = (list, name, exceptId) => list.some((a) => a.name.trim().toLowerCase() === name.trim().toLowerCase() && String(a._id) !== String(exceptId));
const hoursOk = (a) => toMinutes(a.closeTime || '22:00') > toMinutes(a.openTime || '06:00');

// @route   POST /api/bookings/amenities
// @desc    Society admin adds a space residents can book. Every society has its own list.
router.post('/amenities', protect, authorize('society_admin'), amenityRules(), async (req, res) => {
  try {
    const bad = invalid(req, res);
    if (bad) return bad;
    const society = await Society.findById(req.user.societyId).select('amenities');
    if (!society) return fail(res, 404, 'Society not found.');
    const data = pickAmenity(req.body);
    if (sameName(society.amenities, data.name)) return fail(res, 409, `You already have an amenity called ${data.name}.`);
    if (!hoursOk(data)) return fail(res, 400, 'Closing time must be after opening time.');
    if (society.amenities.length >= 40) return fail(res, 400, 'That is the most amenities one society can list.');
    society.amenities.push(data);
    await society.save();
    const created = society.amenities[society.amenities.length - 1];
    res.status(201).json({ success: true, amenity: { ...presentAmenity(created), isActive: created.isActive !== false }, message: `${data.name} added` });
  } catch (error) {
    serverError(res, error, 'Add amenity');
  }
});

// @route   PUT /api/bookings/amenities/:amenityId
// @desc    Change an amenity's details, hours, price or whether it is open for booking
router.put('/amenities/:amenityId', protect, authorize('society_admin'), amenityRules().map((r) => r.optional()), async (req, res) => {
  try {
    const bad = invalid(req, res);
    if (bad) return bad;
    const society = await Society.findById(req.user.societyId).select('amenities');
    const current = society && society.amenities.id(req.params.amenityId);
    if (!current) return fail(res, 404, 'Amenity not found.');
    const data = pickAmenity(req.body);
    if (data.name && sameName(society.amenities, data.name, current._id)) return fail(res, 409, `You already have an amenity called ${data.name}.`);
    const oldName = current.name;
    Object.assign(current, data);
    if (!hoursOk(current)) return fail(res, 400, 'Closing time must be after opening time.');
    await society.save();
    // Bookings and slot locks are keyed by name, so a rename is carried over to future bookings.
    if (data.name && data.name !== oldName) {
      await Booking.updateMany({ societyId: req.user.societyId, amenityId: current._id }, { $set: { amenity: data.name } });
    }
    res.json({ success: true, amenity: { ...presentAmenity(current), isActive: current.isActive !== false }, message: 'Amenity saved' });
  } catch (error) {
    serverError(res, error, 'Update amenity');
  }
});

// @route   DELETE /api/bookings/amenities/:amenityId
// @desc    Remove an amenity. It cannot go while people still hold future bookings: close it instead.
router.delete('/amenities/:amenityId', protect, authorize('society_admin'), async (req, res) => {
  try {
    const society = await Society.findById(req.user.societyId).select('amenities');
    const current = society && society.amenities.id(req.params.amenityId);
    if (!current) return fail(res, 404, 'Amenity not found.');
    const upcoming = await Booking.countDocuments({ societyId: req.user.societyId, amenity: current.name, status: { $in: ACTIVE }, endTime: { $gt: new Date() } });
    if (upcoming) return fail(res, 409, `${current.name} still has ${upcoming} upcoming booking${upcoming === 1 ? '' : 's'}. Close it for new bookings instead, or cancel those first.`);
    current.deleteOne();
    await society.save();
    res.json({ success: true, message: `${current.name} removed` });
  } catch (error) {
    serverError(res, error, 'Remove amenity');
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

      // One key per slot. The unique index on slotKeys makes the database refuse a second booking for any of them,
      // even when two requests pass the check above at the same moment.
      const slotKeys = [];
      for (let t = from; t < to; t += step) slotKeys.push(`${req.user.societyId}|${amenity.name}|${date}|${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);

      let booking;
      try {
        booking = await Booking.create({
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
          approvedAt: auto ? now : undefined,
          slotKeys
        });
      } catch (e) {
        if (e.code === 11000) return fail(res, 409, 'Someone just booked that time. Please pick another slot.');
        throw e;
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
        priority: auto ? 'low' : 'medium',
        // The office only needs a text or email when a booking is waiting for its decision.
        sms: !auto,
        email: !auto
      });
      // The resident gets a receipt of what they booked.
      await tell(req, booking, auto
        ? { type: 'booking_approved', title: 'Amenity booked', message: `${amenity.name} on ${date}, ${startTime} to ${endTime} is confirmed.`, email: true }
        : { type: 'booking_request', title: 'Booking request sent', message: `${amenity.name} on ${date}, ${startTime} to ${endTime} is waiting for the office. You will be told when it is decided.`, email: true });

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
router.get('/', protect, authorize(...MEMBERS, 'security', 'guard_admin'), async (req, res) => {
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
      .limit(paging(req, { max: 500, fallback: 200 }).limit)
      .skip(paging(req).skip);

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

// Each decision is one conditional update: it only applies if the booking is still in the state we expect,
// so an approval and a cancellation arriving together cannot both win.
const decide = (id, from, change) => Booking.findOneAndUpdate({ _id: id, status: { $in: from } }, { $set: change }, { new: true });

const notFoundOrDecided = async (res, id) => {
  const exists = await Booking.findById(id).select('status');
  if (!exists) return fail(res, 404, 'Booking not found');
  return fail(res, 409, `This booking is already ${exists.status}.`);
};

// @route   PUT /api/bookings/:id/approve
router.put('/:id/approve', protect, authorize('society_admin', 'super_admin'), async (req, res) => {
  try {
    const current = await Booking.findById(req.params.id);
    if (!current) return fail(res, 404, 'Booking not found');
    if (current.status !== 'pending') return fail(res, 409, `This booking is already ${current.status}.`);
    if (current.endTime <= new Date()) return fail(res, 400, 'This slot has already passed.');

    // Do not confirm two bookings for the same time.
    const clash = await Booking.findOne({ ...overlapping(current.amenity, current.societyId, current.startTime, current.endTime, current._id), status: 'approved' });
    if (clash) return fail(res, 409, 'Another booking is already approved for this time. Reject this one instead.');

    const booking = await decide(current._id, ['pending'], { status: 'approved', approvedBy: req.user.id, approvedAt: new Date() });
    if (!booking) return notFoundOrDecided(res, current._id);

    await tell(req, booking, { type: 'booking_approved', title: 'Booking approved', message: `Your ${booking.amenity} booking is confirmed.`, email: true });
    res.json({ success: true, booking, message: 'Booking approved' });
  } catch (error) {
    serverError(res, error, 'Approve booking');
  }
});

// @route   PUT /api/bookings/:id/reject
router.put('/:id/reject', protect, authorize('society_admin', 'super_admin'), [body('reason').optional().isString().isLength({ max: 200 })], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const reason = (req.body.reason || '').trim() || 'No reason given';
    const booking = await decide(req.params.id, ACTIVE, { status: 'rejected', rejectedReason: reason, slotKeys: [] });
    if (!booking) return notFoundOrDecided(res, req.params.id);

    await tell(req, booking, { type: 'booking_rejected', title: 'Booking not approved', message: `Your ${booking.amenity} booking was not approved: ${reason}`, priority: 'high', sms: true, email: true });
    res.json({ success: true, booking, message: 'Booking rejected' });
  } catch (error) {
    serverError(res, error, 'Reject booking');
  }
});

// @route   PUT /api/bookings/:id/cancel
router.put('/:id/cancel', protect, authorize('resident', 'society_admin', 'super_admin'), [body('reason').optional().isString().isLength({ max: 200 })], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const current = await Booking.findById(req.params.id);
    if (!current) return fail(res, 404, 'Booking not found');

    const byAdmin = isAdminRole(req.user);
    if (!byAdmin && String(current.residentId) !== String(req.user.id)) return fail(res, 403, 'You can only cancel your own bookings.');
    if (!ACTIVE.includes(current.status)) return fail(res, 400, 'This booking cannot be cancelled.');
    if (current.startTime <= new Date()) return fail(res, 400, 'This booking has already started.');

    const reason = (req.body.reason || '').trim() || (byAdmin ? 'Cancelled by the society office' : 'Cancelled by resident');
    const booking = await decide(current._id, ACTIVE, { status: 'cancelled', cancellationReason: reason, cancelledAt: new Date(), slotKeys: [] });
    if (!booking) return notFoundOrDecided(res, current._id);

    if (byAdmin) {
      await tell(req, booking, { type: 'booking_rejected', title: 'Booking cancelled', message: `Your ${booking.amenity} booking was cancelled: ${reason}`, priority: 'high', sms: true, email: true });
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
