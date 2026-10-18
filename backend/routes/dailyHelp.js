const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { body, query } = require('express-validator');
const DailyHelp = require('../models/DailyHelp');
const HelpAttendance = require('../models/HelpAttendance');
const Society = require('../models/Society');
const { protect, authorize, scopeToSociety } = require('../middleware/auth');
const { safeNotifyMany } = require('../utils/safeNotify');
const { DEFAULT_TZ, todayIn, isValidDate } = require('../utils/timezone');
const rateLimit = require('express-rate-limit');
const { fail, invalid, serverError, societyFor, flatLabel, isSafeUrl } = require('../utils/routeKit');
const { generateQRCode } = require('../utils/generateQR');

router.param('id', scopeToSociety(DailyHelp));

// Gate codes are only six digits, so guessing them must be slow: a few wrong tries per person, then a wait.
const guessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user ? req.user.id : req.ip),
  validate: false,
  message: { success: false, message: 'Too many wrong codes. Please wait 15 minutes and try again.' }
});

const STALE_HOURS = 20; // a check-in older than this with no check-out is treated as forgotten

const societyTz = async (societyId) => {
  const s = await Society.findById(societyId).select('timezone').lean();
  return (s && s.timezone) || DEFAULT_TZ;
};

const sixDigits = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

const linked = (help, userId) => help.residents.some((r) => String(r.userId) === String(userId));

const present = (help, { today, viewer, attendance } = {}) => {
  const out = {
    _id: help._id,
    name: help.name,
    phone: help.phone,
    kind: help.kind,
    photo: help.photo,
    isActive: help.isActive,
    flats: help.residents.map((r) => r.flat).filter(Boolean),
    households: help.residents.length
  };
  // The gate code is for the households the helper works for to give them. Guards and admins type it in but never read it.
  if (viewer && viewer.role === 'resident' && linked(help, viewer.id)) out.code = help.code;
  if (attendance) {
    out.today = { status: attendance.checkOut ? 'left' : 'inside', checkIn: attendance.checkIn, checkOut: attendance.checkOut };
  } else if (today) {
    out.today = { status: 'not_arrived' };
  }
  return out;
};

// Newest attendance row per help, for today.
const todaysRows = async (helpIds, date) => {
  const rows = await HelpAttendance.find({ helpId: { $in: helpIds }, date }).sort({ checkIn: -1 });
  const byHelp = {};
  rows.forEach((r) => {
    if (!byHelp[String(r.helpId)]) byHelp[String(r.helpId)] = r;
  });
  return byHelp;
};

// @route   GET /api/daily-help
// @desc    Residents see the helpers who work for them; admins and guards see everyone in the society.
router.get('/', protect, authorize('resident', 'society_admin', 'super_admin', 'security'), async (req, res) => {
  try {
    const societyId = societyFor(req);
    if (!societyId) return res.json({ success: true, helpers: [] });
    const filter = { societyId, isActive: true };
    if (req.user.role === 'resident') filter['residents.userId'] = req.user.id;
    if (req.query.inside === 'true') {
      const open = await HelpAttendance.find({ societyId, checkOut: null, checkIn: { $gte: new Date(Date.now() - STALE_HOURS * 3600 * 1000) } }).select('helpId');
      filter._id = { $in: open.map((o) => o.helpId) };
    }
    const helpers = await DailyHelp.find(filter).sort({ name: 1 }).limit(300);
    const today = todayIn(await societyTz(societyId));
    const rows = await todaysRows(helpers.map((h) => h._id), today);
    res.json({ success: true, helpers: helpers.map((h) => present(h, { today, viewer: req.user, attendance: rows[String(h._id)] })) });
  } catch (error) {
    serverError(res, error, 'List daily help');
  }
});

const helpRules = [
  body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Enter their name'),
  body('phone').optional({ checkFalsy: true }).matches(/^[0-9+\-() ]{6,20}$/).withMessage('Enter a valid phone number'),
  body('kind').optional().isIn(DailyHelp.KINDS).withMessage('Unknown type of help'),
  body('photo').optional({ checkFalsy: true }).custom(isSafeUrl).withMessage('The photo link is not valid')
];

// @route   POST /api/daily-help
// @desc    A resident adds a maid, cook, driver and so on. They get a 6-digit code to show the guard.
router.post('/', protect, authorize('resident'), helpRules, async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const mine = await DailyHelp.countDocuments({ 'residents.userId': req.user.id, isActive: true });
    if (mine >= 15) return fail(res, 400, 'You have reached the limit of 15 helpers.');

    let help = null;
    for (let attempt = 0; attempt < 5 && !help; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        help = await DailyHelp.create({
          societyId: req.user.societyId,
          name: req.body.name,
          phone: req.body.phone || '',
          kind: req.body.kind || 'maid',
          photo: req.body.photo || undefined,
          code: sixDigits(),
          residents: [{ userId: req.user.id, flat: flatLabel(req.user) }],
          addedBy: req.user.id
        });
      } catch (e) {
        if (e.code !== 11000) throw e; // a clash on the code: try another one
      }
    }
    if (!help) return fail(res, 500, 'Could not create a gate code. Please try again.');
    res.status(201).json({ success: true, helper: present(help, { viewer: req.user }), message: `Added. Their gate code is ${help.code}.` });
  } catch (error) {
    if (error.name === 'ValidationError') return fail(res, 400, Object.values(error.errors)[0].message);
    return serverError(res, error, 'Add daily help');
  }
});

// @route   POST /api/daily-help/link
// @desc    Add a helper who already works in the society (say, a maid who serves two flats) by their code.
router.post('/link', protect, authorize('resident'), guessLimiter, [body('code').trim().matches(/^\d{6}$/).withMessage('The code is 6 digits')], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const help = await DailyHelp.findOne({ societyId: req.user.societyId, code: req.body.code, isActive: true });
    if (!help) return fail(res, 404, 'No helper found with that code.');
    if (linked(help, req.user.id)) return fail(res, 409, 'This helper is already on your list.');
    const existing = help.residents.map((r) => r.userId);
    help.residents.push({ userId: req.user.id, flat: flatLabel(req.user) });
    await help.save();
    // Households already using this helper are told, so a guessed code does not go unnoticed.
    await safeNotifyMany(req.app.get('io'), existing, {
      societyId: help.societyId,
      type: 'daily_help',
      title: `${help.name} was added by another home`,
      message: `${req.user.name} (${flatLabel(req.user)}) added ${help.name} using their gate code.`,
      relatedId: help._id,
      relatedModel: 'DailyHelp',
      actionUrl: '/daily-help',
      priority: 'medium'
    });
    res.json({ success: true, helper: present(help, { viewer: req.user }), message: `${help.name} added to your list.` });
  } catch (error) {
    serverError(res, error, 'Link daily help');
  }
});

// @route   DELETE /api/daily-help/:id
// @desc    A resident removes a helper from their household. When no household is left the helper is deactivated.
router.delete('/:id', protect, authorize('resident', 'society_admin', 'super_admin'), async (req, res) => {
  try {
    const help = await DailyHelp.findById(req.params.id);
    if (!help) return fail(res, 404, 'Helper not found');
    if (req.user.role === 'resident') {
      if (!linked(help, req.user.id)) return fail(res, 403, 'This helper is not on your list.');
      help.residents = help.residents.filter((r) => String(r.userId) !== String(req.user.id));
      if (!help.residents.length) help.isActive = false;
    } else {
      help.isActive = false; // an admin can bar a helper entirely
    }
    await help.save();
    res.json({ success: true, message: 'Removed' });
  } catch (error) {
    serverError(res, error, 'Remove daily help');
  }
});

// @route   GET /api/daily-help/:id/attendance?month=YYYY-MM
router.get('/:id/attendance', protect, authorize('resident', 'society_admin', 'super_admin'), [query('month').optional().matches(/^\d{4}-(0[1-9]|1[0-2])$/).withMessage('Month must look like 2026-10')], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const help = await DailyHelp.findById(req.params.id);
    if (!help) return fail(res, 404, 'Helper not found');
    if (req.user.role === 'resident' && !linked(help, req.user.id)) return fail(res, 403, 'This helper is not on your list.');

    const tz = await societyTz(help.societyId);
    const month = req.query.month || todayIn(tz).slice(0, 7);
    const records = await HelpAttendance.find({ helpId: help._id, date: { $regex: `^${month}-` } }).sort({ checkIn: 1 });
    const days = [...new Set(records.map((r) => r.date))];
    res.json({
      success: true,
      month,
      helper: { _id: help._id, name: help.name, kind: help.kind },
      daysPresent: days.length,
      records: records.map((r) => ({ date: r.date, checkIn: r.checkIn, checkOut: r.checkOut }))
    });
  } catch (error) {
    serverError(res, error, 'Attendance');
  }
});

// @route   GET /api/daily-help/:id/pass
// @desc    The QR code a helper shows at the gate, for the households they work for
router.get('/:id/pass', protect, authorize('resident'), async (req, res) => {
  try {
    const help = await DailyHelp.findById(req.params.id);
    if (!help || !help.isActive) return fail(res, 404, 'Helper not found');
    if (!linked(help, req.user.id)) return fail(res, 403, 'This helper is not on your list.');
    const qrCodeImage = await generateQRCode({ type: 'daily_help', code: help.code, societyId: String(help.societyId) });
    res.json({ success: true, code: help.code, qrCodeImage });
  } catch (error) {
    serverError(res, error, 'Helper pass');
  }
});

// @route   GET /api/daily-help/lookup/:code
// @desc    The guard types or scans the helper's code and sees who it is and whether they are inside, before choosing check in or out.
router.get('/lookup/:code', protect, authorize('security', 'society_admin', 'super_admin'), guessLimiter, async (req, res) => {
  try {
    const societyId = societyFor(req);
    if (!societyId) return fail(res, 400, 'Choose a society first.');
    if (!/^\d{6}$/.test(req.params.code)) return fail(res, 400, 'The code is 6 digits');
    const help = await DailyHelp.findOne({ societyId, code: req.params.code, isActive: true });
    if (!help) return fail(res, 404, 'This code is not valid. Ask the resident to check it.');
    const fresh = new Date(Date.now() - STALE_HOURS * 3600 * 1000);
    const open = await HelpAttendance.findOne({ helpId: help._id, open: true, checkIn: { $gte: fresh } }).sort({ checkIn: -1 });
    res.json({
      success: true,
      helper: { ...present(help, { viewer: req.user }), flats: help.residents.map((r) => r.flat).filter(Boolean) },
      inside: !!open,
      since: open ? open.checkIn : null,
      next: open ? 'out' : 'in'
    });
  } catch (error) {
    serverError(res, error, 'Look up daily help');
  }
});

// @route   POST /api/daily-help/check
// @desc    The guard types the code the helper shows. First time of the day checks them in, the next checks them out.
router.post('/check', protect, authorize('security', 'society_admin', 'super_admin'), guessLimiter, [body('code').trim().matches(/^\d{6}$/).withMessage('The code is 6 digits'), body('action').optional({ checkFalsy: true }).isIn(['in', 'out']).withMessage('Choose check in or check out')], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const societyId = societyFor(req);
    if (!societyId) return fail(res, 400, 'Choose a society first.');
    const help = await DailyHelp.findOne({ societyId, code: req.body.code, isActive: true });
    if (!help) return fail(res, 404, 'This code is not valid. Ask the resident to check it.');

    const now = new Date();
    const tz = await societyTz(societyId);
    const fresh = new Date(now.getTime() - STALE_HOURS * 3600 * 1000);
    // A visit left open for too long was forgotten at the gate: close it so today's check-in is not blocked.
    await HelpAttendance.updateMany({ helpId: help._id, open: true, checkIn: { $lt: fresh } }, { $set: { open: false } });

    let action;
    const wanted = req.body.action;
    // Check-out is a single conditional update, so a double tap cannot close it twice.
    const closed = wanted === 'in' ? null : await HelpAttendance.findOneAndUpdate({ helpId: help._id, open: true }, { $set: { checkOut: now, open: false } }, { new: true });
    if (wanted === 'in' && (await HelpAttendance.exists({ helpId: help._id, open: true }))) {
      return fail(res, 409, `${help.name} is already inside. Use check out when they leave.`);
    }
    if (wanted === 'out' && !closed) {
      return fail(res, 409, `${help.name} is not inside right now, so there is nothing to check out.`);
    }
    if (closed) {
      action = 'out';
    } else {
      try {
        await HelpAttendance.create({ societyId, helpId: help._id, date: todayIn(tz, now), checkIn: now, open: true, markedBy: req.user.id });
        action = 'in';
      } catch (e) {
        if (e.code === 11000) return fail(res, 409, 'This helper was just checked in by someone else.');
        throw e;
      }
    }

    await safeNotifyMany(req.app.get('io'), help.residents.map((r) => r.userId), {
      societyId,
      type: 'daily_help',
      title: action === 'in' ? `${help.name} has arrived` : `${help.name} has left`,
      message: `Checked ${action} at the gate at ${now.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: tz })}.`,
      relatedId: help._id,
      relatedModel: 'DailyHelp',
      actionUrl: '/daily-help',
      priority: 'low'
    });

    res.json({
      success: true,
      action,
      helper: { _id: help._id, name: help.name, kind: help.kind, photo: help.photo, flats: help.residents.map((r) => r.flat).filter(Boolean) },
      time: now,
      message: action === 'in' ? `${help.name} checked in` : `${help.name} checked out`
    });
  } catch (error) {
    serverError(res, error, 'Check daily help');
  }
});

module.exports = router;
