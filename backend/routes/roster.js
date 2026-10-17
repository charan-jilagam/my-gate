const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const Shift = require('../models/Shift');
const User = require('../models/User');
const Society = require('../models/Society');
const { protect, authorize, scopeToSociety } = require('../middleware/auth');
const { safeNotify } = require('../utils/safeNotify');
const { DEFAULT_TZ, todayIn, addDays, isValidDate, isValidTime, zonedToUtc, toMinutes } = require('../utils/timezone');
const { fail, invalid, serverError, societyFor } = require('../utils/routeKit');

router.param('id', scopeToSociety(Shift));

const ADMINS = ['society_admin', 'super_admin'];
const ON_DUTY_ROLES = ['security', 'staff'];
const EARLY_MINUTES = 30; // a guard may clock in this long before the shift starts
const isDuplicateKey = (e) => e && (e.code === 11000 || /E11000/.test(e.message || ''));

const societyTz = async (societyId) => {
  const s = await Society.findById(societyId).select('timezone').lean();
  return (s && s.timezone) || DEFAULT_TZ;
};

const idOf = (v) => String((v && v._id) || v);

const present = (s, now = new Date()) => ({
  _id: s._id,
  userId: idOf(s.userId),
  person: s.userId && s.userId.name ? { name: s.userId.name, role: s.userId.role, phone: s.userId.phone } : undefined,
  date: s.date,
  startTime: s.startTime,
  endTime: s.endTime,
  overnight: toMinutes(s.endTime) <= toMinutes(s.startTime),
  post: s.post,
  note: s.note,
  clockInAt: s.clockInAt,
  clockOutAt: s.clockOutAt,
  phase: s.phase(now)
});

const rangeDays = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

// @route   GET /api/roster/people   (office)
// @desc    Guards and staff who can be given shifts.
router.get('/people', protect, authorize(...ADMINS), async (req, res) => {
  try {
    const societyId = societyFor(req);
    if (!societyId) return res.json({ success: true, people: [] });
    const people = await User.find({ societyId, role: { $in: ON_DUTY_ROLES }, isApproved: true, isActive: true }).select('name role phone').sort({ name: 1 }).limit(200).lean();
    res.json({ success: true, people });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'List roster people');
  }
});

// @route   GET /api/roster?from=&to=&userId=   (office)
router.get(
  '/',
  protect,
  authorize(...ADMINS),
  [query('from').optional().custom(isValidDate), query('to').optional().custom(isValidDate), query('userId').optional().isMongoId()],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      const societyId = societyFor(req);
      if (!societyId) return res.json({ success: true, shifts: [] });
      const today = todayIn(await societyTz(societyId));
      const from = req.query.from || today;
      const to = req.query.to || addDays(from, 6);
      if (to < from) return fail(res, 400, 'The end date is before the start date.');
      if (rangeDays(from, to) > 31) return fail(res, 400, 'Pick a range of 31 days or less.');
      const filter = { societyId, date: { $gte: from, $lte: to } };
      if (req.query.userId) filter.userId = req.query.userId;
      const shifts = await Shift.find(filter).populate('userId', 'name role phone').sort({ date: 1, startTime: 1 }).limit(1000);
      const now = new Date();
      res.json({ success: true, from, to, today, shifts: shifts.map((s) => present(s, now)) });
      return undefined;
    } catch (error) {
      return serverError(res, error, 'List roster');
    }
  }
);

// @route   GET /api/roster/mine   (guards and staff)
// @desc    My shifts from yesterday (for night shifts still running) to two weeks ahead.
router.get('/mine', protect, authorize(...ON_DUTY_ROLES), async (req, res) => {
  try {
    const today = todayIn(await societyTz(req.user.societyId));
    const shifts = await Shift.find({ userId: req.user.id, date: { $gte: addDays(today, -1), $lte: addDays(today, 14) } }).sort({ date: 1, startTime: 1 });
    const now = new Date();
    const list = shifts.map((s) => {
      const p = present(s, now);
      p.canClockIn = !s.clockInAt && now <= s.endAt && now >= new Date(s.startAt.getTime() - EARLY_MINUTES * 60000);
      p.canClockOut = !!s.clockInAt && !s.clockOutAt;
      return p;
    });
    // A finished shift from yesterday is clutter; keep it only if it still needs attention.
    res.json({ success: true, today, shifts: list.filter((s) => s.date >= today || s.phase === 'on_duty') });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'My shifts');
  }
});

// @route   POST /api/roster   (office)
// @desc    Give one person the same shift on one or many dates (up to 31).
router.post(
  '/',
  protect,
  authorize(...ADMINS),
  [
    body('userId').isMongoId().withMessage('Choose who is on duty'),
    body('dates').isArray({ min: 1, max: 31 }).withMessage('Pick between 1 and 31 dates'),
    body('dates.*').custom(isValidDate).withMessage('One of the dates is not valid'),
    body('startTime').custom(isValidTime).withMessage('Enter a start time like 08:00'),
    body('endTime').custom(isValidTime).withMessage('Enter an end time like 16:00'),
    body('post').optional().isIn(Shift.POSTS).withMessage('Unknown post'),
    body('note').optional().isString().isLength({ max: 200 })
  ],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      const societyId = societyFor(req);
      if (!societyId) return fail(res, 400, 'Choose a society first.');
      const { userId, startTime, endTime, post, note } = req.body;
      if (startTime === endTime) return fail(res, 400, 'The shift must have some length. For a night shift, end the next morning (for example 22:00 to 06:00).');

      const person = await User.findById(userId).select('name role societyId isApproved isActive');
      if (!person || String(person.societyId) !== String(societyId) || !ON_DUTY_ROLES.includes(person.role) || !person.isActive) {
        return fail(res, 400, 'That person is not a guard or staff member of this society.');
      }

      const tz = await societyTz(societyId);
      const dates = [...new Set(req.body.dates)].sort();
      const overnight = toMinutes(endTime) <= toMinutes(startTime);
      const created = [];
      let skipped = 0;
      for (const date of dates) {
        const startAt = zonedToUtc(date, startTime, tz);
        const endAt = zonedToUtc(overnight ? addDays(date, 1) : date, endTime, tz);
        try {
          const shift = await Shift.create({ societyId, userId: person._id, date, startTime, endTime, startAt, endAt, post, note, createdBy: req.user.id });
          created.push(shift.date);
        } catch (e) {
          if (isDuplicateKey(e)) skipped += 1;
          else throw e;
        }
      }

      if (created.length) {
        await safeNotify(req.app.get('io'), person._id, {
          societyId,
          type: 'shift',
          title: 'New shifts',
          message: created.length === 1 ? `You are on duty on ${created[0]}, ${startTime} to ${endTime}.` : `${created.length} new shifts, ${startTime} to ${endTime}, from ${created[0]}.`,
          relatedModel: 'Shift',
          actionUrl: '/my-shifts'
        });
      }
      const message = created.length ? `Added ${created.length} shift${created.length === 1 ? '' : 's'}${skipped ? `. ${skipped} already existed.` : '.'}` : 'Nothing added: that person already has these shifts.';
      res.status(created.length ? 201 : 200).json({ success: true, created: created.length, skipped, message });
      return undefined;
    } catch (error) {
      if (error.name === 'ValidationError') return fail(res, 400, Object.values(error.errors)[0].message);
      return serverError(res, error, 'Create shifts');
    }
  }
);

// @route   DELETE /api/roster/:id   (office)
router.delete('/:id', protect, authorize(...ADMINS), async (req, res) => {
  try {
    // A shift someone already clocked in to is a record of work done and stays.
    const removed = await Shift.findOneAndDelete({ _id: req.params.id, clockInAt: { $exists: false } });
    if (!removed) return fail(res, 409, 'This shift cannot be removed: it is already under way or finished.');
    res.json({ success: true, message: 'Shift removed' });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'Delete shift');
  }
});

// @route   POST /api/roster/:id/clock-in   (the person on the shift)
router.post('/:id/clock-in', protect, authorize(...ON_DUTY_ROLES), async (req, res) => {
  try {
    const now = new Date();
    const shift = await Shift.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id, clockInAt: { $exists: false }, endAt: { $gte: now }, startAt: { $lte: new Date(now.getTime() + EARLY_MINUTES * 60000) } },
      { $set: { clockInAt: now } },
      { new: true }
    );
    if (shift) return res.json({ success: true, shift: present(shift, now), message: 'You are on duty.' });

    const existing = await Shift.findById(req.params.id);
    if (!existing || idOf(existing.userId) !== String(req.user.id)) return fail(res, 404, 'Shift not found');
    if (existing.clockInAt) return fail(res, 409, 'You already clocked in.');
    if (now > existing.endAt) return fail(res, 409, 'This shift is over.');
    return fail(res, 409, `Too early. You can clock in ${EARLY_MINUTES} minutes before the shift starts.`);
  } catch (error) {
    return serverError(res, error, 'Clock in');
  }
});

// @route   POST /api/roster/:id/clock-out
router.post('/:id/clock-out', protect, authorize(...ON_DUTY_ROLES), async (req, res) => {
  try {
    const now = new Date();
    const shift = await Shift.findOneAndUpdate({ _id: req.params.id, userId: req.user.id, clockInAt: { $exists: true }, clockOutAt: { $exists: false } }, { $set: { clockOutAt: now } }, { new: true });
    if (shift) return res.json({ success: true, shift: present(shift, now), message: 'Shift finished. Thank you!' });

    const existing = await Shift.findById(req.params.id);
    if (!existing || idOf(existing.userId) !== String(req.user.id)) return fail(res, 404, 'Shift not found');
    if (existing.clockOutAt) return fail(res, 409, 'You already clocked out.');
    return fail(res, 409, 'Clock in first.');
  } catch (error) {
    return serverError(res, error, 'Clock out');
  }
});

module.exports = router;
