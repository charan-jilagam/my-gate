const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const mongoose = require('mongoose');
const Shift = require('../models/Shift');
const User = require('../models/User');
const Society = require('../models/Society');
const GuardPost = require('../models/GuardPost');
const GuardAvailability = require('../models/GuardAvailability');
const SwapRequest = require('../models/SwapRequest');
const GuardLocation = require('../models/GuardLocation');
const { protect, authorize, scopeToSociety } = require('../middleware/auth');
const { safeNotify, safeNotifyMany } = require('../utils/safeNotify');
const { DEFAULT_TZ, todayIn, addDays, isValidDate, isValidTime, toMinutes } = require('../utils/timezone');
const { fail, invalid, serverError, societyFor } = require('../utils/routeKit');
const { isCoord, placeFor, checkPlace, distanceM } = require('../utils/geo');
const { allocate, buildDemands, DEFAULTS } = require('../utils/allocator');
const { onDutyNow, pickDesk, guardHead, idsWithRoles, DUTY_ROLES, OFFICE_ROLES } = require('../utils/duty');

router.param('postId', scopeToSociety(GuardPost));
router.param('swapId', scopeToSociety(SwapRequest));

const ADMINS = ['society_admin', 'super_admin'];
const MEMBERS = ['resident', ...DUTY_ROLES, ...ADMINS];
const STAFF_KINDS = ['housekeeping', 'garden', 'maintenance']; // posts worked by staff rather than guards
const GRACE_MINUTES = 10; // clocking in up to this long after the start is still "on time"
const STALE_MINUTES = 5; // a location older than this is shown as out of date
const SWAP_NOTICE_MINUTES = 60; // a swap must be asked for at least this long before the earlier shift starts
const isDuplicateKey = (e) => e && (e.code === 11000 || /E11000/.test(e.message || ''));
const idOf = (v) => String((v && v._id) || v);
const first = (name = '') => String(name).trim().split(/\s+/)[0] || 'A guard';

const societyTz = async (societyId) => {
  const s = await Society.findById(societyId).select('timezone').lean();
  return (s && s.timezone) || DEFAULT_TZ;
};

const timeLabel = (hm) => {
  const [h, m] = hm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};
const dayText = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const shiftText = (s) => `${dayText(s.date)}, ${timeLabel(s.startTime)} to ${timeLabel(s.endTime)}`;

const presentShift = (s) =>
  s && {
    _id: s._id,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    overnight: toMinutes(s.endTime) <= toMinutes(s.startTime),
    post: s.post,
    postName: s.postName || undefined,
    startAt: s.startAt,
    endAt: s.endAt
  };

// ---------------------------------------------------------------------------------------------
// Society location (set by the admin)
// ---------------------------------------------------------------------------------------------

// @route   GET /api/guards/location
router.get('/location', protect, authorize(...DUTY_ROLES, ...ADMINS), async (req, res) => {
  try {
    const societyId = societyFor(req);
    if (!societyId) return res.json({ success: true, location: null, posts: [] });
    const [society, posts] = await Promise.all([Society.findById(societyId).select('name location').lean(), GuardPost.find({ societyId, isActive: true }).select('name kind lat lng radiusMeters').lean()]);
    const loc = society && society.location && isCoord(society.location.lat, society.location.lng) ? society.location : null;
    res.json({ success: true, name: society && society.name, location: loc, posts: posts || [] });
  } catch (error) {
    serverError(res, error, 'Get society location');
  }
});

// @route   PUT /api/guards/location   (admin)
router.put(
  '/location',
  protect,
  authorize(...ADMINS),
  [
    body('lat').isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
    body('lng').isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
    body('radiusMeters').optional().isInt({ min: 50, max: 5000 }).withMessage('The allowed distance must be between 50 and 5000 metres'),
    body('label').optional({ nullable: true }).isString().isLength({ max: 120 }),
    body('address').optional({ nullable: true }).isString().isLength({ max: 300 }).withMessage('The address must be 300 characters or fewer')
  ],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      const societyId = societyFor(req);
      if (!societyId) return fail(res, 400, 'Choose a society first.');
      const society = await Society.findById(societyId);
      if (!society) return fail(res, 404, 'Society not found');
      society.location = {
        lat: Number(req.body.lat),
        lng: Number(req.body.lng),
        radiusMeters: req.body.radiusMeters !== undefined ? Number(req.body.radiusMeters) : (society.location && society.location.radiusMeters) || 300,
        label: (req.body.label || '').trim(),
        address: req.body.address !== undefined ? String(req.body.address || '').trim() : (society.location && society.location.address) || ''
      };
      await society.save();
      res.json({ success: true, location: society.location, message: 'Society location saved' });
      return undefined;
    } catch (error) {
      return serverError(res, error, 'Save society location');
    }
  }
);

// ---------------------------------------------------------------------------------------------
// Guard posts: the places the admin wants guards, and how many each needs
// ---------------------------------------------------------------------------------------------

const postRules = [
  body('name').trim().isLength({ min: 2, max: 60 }).withMessage('Give the place a name, for example "Main gate"'),
  body('kind').optional().isIn(GuardPost.KINDS).withMessage('Unknown kind of post'),
  body('lat').optional({ nullable: true, checkFalsy: false }).isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
  body('lng').optional({ nullable: true }).isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
  body('radiusMeters').optional({ nullable: true }).isInt({ min: 20, max: 2000 }).withMessage('The allowed distance must be between 20 and 2000 metres'),
  body('slots').optional().isArray({ max: 6 }).withMessage('A post can have up to 6 time slots'),
  body('slots.*.start').custom(isValidTime).withMessage('Enter a start time like 06:00'),
  body('slots.*.end').custom(isValidTime).withMessage('Enter an end time like 14:00'),
  body('slots.*.guards').optional().isInt({ min: 1, max: 20 }).withMessage('Each slot needs between 1 and 20 guards'),
  body('slots.*.label').optional({ nullable: true }).isString().isLength({ max: 30 }),
  body('isActive').optional().isBoolean()
];

const cleanSlots = (slots) => (slots || []).map((s) => ({ label: (s.label || '').trim(), start: s.start, end: s.end, guards: Number(s.guards) || 1 }));

// @route   GET /api/guards/posts
router.get('/posts', protect, authorize(...DUTY_ROLES, ...ADMINS), async (req, res) => {
  try {
    const societyId = societyFor(req);
    if (!societyId) return res.json({ success: true, posts: [] });
    const posts = await GuardPost.find({ societyId }).sort({ name: 1 }).lean();
    res.json({ success: true, posts: posts || [] });
  } catch (error) {
    serverError(res, error, 'List guard posts');
  }
});

// @route   POST /api/guards/posts   (admin)
router.post('/posts', protect, authorize(...ADMINS), postRules, async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const societyId = societyFor(req);
    if (!societyId) return fail(res, 400, 'Choose a society first.');
    const slots = cleanSlots(req.body.slots);
    if (slots.some((s) => s.start === s.end)) return fail(res, 400, 'A slot needs a start and an end that are different. For a night slot, end the next morning (22:00 to 06:00).');
    if ((await GuardPost.countDocuments({ societyId })) >= 30) return fail(res, 400, 'You can have up to 30 posts. Remove one you no longer use.');
    const post = await GuardPost.create({
      societyId,
      name: req.body.name,
      kind: req.body.kind || 'main_gate',
      lat: req.body.lat === null || req.body.lat === '' ? undefined : req.body.lat,
      lng: req.body.lng === null || req.body.lng === '' ? undefined : req.body.lng,
      radiusMeters: req.body.radiusMeters || undefined,
      slots,
      createdBy: req.user.id
    });
    res.status(201).json({ success: true, post, message: 'Post added' });
    return undefined;
  } catch (error) {
    if (error.name === 'ValidationError') return fail(res, 400, Object.values(error.errors)[0].message);
    return serverError(res, error, 'Create guard post');
  }
});

// @route   PUT /api/guards/posts/:postId   (admin)
router.put('/posts/:postId', protect, authorize(...ADMINS), postRules, async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const post = await GuardPost.findById(req.params.postId);
    if (!post) return fail(res, 404, 'Post not found');
    const slots = req.body.slots !== undefined ? cleanSlots(req.body.slots) : undefined;
    if (slots && slots.some((s) => s.start === s.end)) return fail(res, 400, 'A slot needs a start and an end that are different.');
    ['name', 'kind', 'radiusMeters', 'isActive'].forEach((k) => {
      if (req.body[k] !== undefined && req.body[k] !== null) post[k] = req.body[k];
    });
    ['lat', 'lng'].forEach((k) => {
      if (req.body[k] === null || req.body[k] === '') post[k] = undefined;
      else if (req.body[k] !== undefined) post[k] = req.body[k];
    });
    if (slots) post.slots = slots;
    await post.save();
    res.json({ success: true, post, message: 'Post saved' });
    return undefined;
  } catch (error) {
    if (error.name === 'ValidationError') return fail(res, 400, Object.values(error.errors)[0].message);
    return serverError(res, error, 'Update guard post');
  }
});

// @route   DELETE /api/guards/posts/:postId   (admin)
// @desc    Shifts already made for the post keep its name, so history stays readable.
router.delete('/posts/:postId', protect, authorize(...ADMINS), async (req, res) => {
  try {
    const post = await GuardPost.findById(req.params.postId);
    if (!post) return fail(res, 404, 'Post not found');
    await GuardPost.deleteOne({ _id: post._id });
    res.json({ success: true, message: 'Post removed' });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'Delete guard post');
  }
});

// ---------------------------------------------------------------------------------------------
// Availability: when each guard can work
// ---------------------------------------------------------------------------------------------

const defaultWeek = () => [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, available: true, start: '00:00', end: '23:59' }));

// @route   GET /api/guards/availability/me
router.get('/availability/me', protect, authorize(...DUTY_ROLES), async (req, res) => {
  try {
    const doc = await GuardAvailability.findOne({ userId: req.user.id }).lean();
    const weekly = defaultWeek().map((d) => (doc && (doc.weekly || []).find((w) => w.day === d.day)) || d);
    res.json({ success: true, isSet: !!doc, weekly, offDates: (doc && doc.offDates) || [], note: (doc && doc.note) || '' });
  } catch (error) {
    serverError(res, error, 'Get my availability');
  }
});

// @route   PUT /api/guards/availability/me
router.put(
  '/availability/me',
  protect,
  authorize(...DUTY_ROLES),
  [
    body('weekly').isArray({ min: 1, max: 7 }).withMessage('Choose your days'),
    body('weekly.*.day').isInt({ min: 0, max: 6 }).withMessage('Unknown day'),
    body('weekly.*.available').isBoolean().withMessage('Say whether you can work that day'),
    body('weekly.*.start').optional().custom(isValidTime).withMessage('Enter a start time like 06:00'),
    body('weekly.*.end').optional().custom(isValidTime).withMessage('Enter an end time like 22:00'),
    body('offDates').optional().isArray({ max: 60 }).withMessage('Too many days off'),
    body('offDates.*').custom(isValidDate).withMessage('One of the days off is not a valid date'),
    body('note').optional({ nullable: true }).isString().isLength({ max: 200 })
  ],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      const days = new Set();
      const weekly = [];
      for (const w of req.body.weekly) {
        if (days.has(Number(w.day))) continue;
        days.add(Number(w.day));
        weekly.push({ day: Number(w.day), available: !!w.available, start: w.start || '00:00', end: w.end || '23:59' });
      }
      const today = todayIn(await societyTz(req.user.societyId));
      const offDates = [...new Set(req.body.offDates || [])].filter((d) => d >= today).sort();
      const doc = await GuardAvailability.findOneAndUpdate(
        { userId: req.user.id },
        { $set: { societyId: req.user.societyId, weekly, offDates, note: (req.body.note || '').trim() } },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
      );
      res.json({ success: true, weekly: (doc && doc.weekly) || weekly, offDates: (doc && doc.offDates) || offDates, message: 'Your availability is saved' });
      return undefined;
    } catch (error) {
      if (error.name === 'ValidationError') return fail(res, 400, Object.values(error.errors)[0].message);
      return serverError(res, error, 'Save my availability');
    }
  }
);

// @route   GET /api/guards/availability   (office)
router.get('/availability', protect, authorize(...OFFICE_ROLES), async (req, res) => {
  try {
    const societyId = societyFor(req);
    if (!societyId) return res.json({ success: true, people: [] });
    const people = await User.find({ societyId, role: { $in: DUTY_ROLES }, isApproved: true, isActive: true }).select('name role phone').sort({ name: 1 }).limit(200).lean();
    const docs = await GuardAvailability.find({ societyId }).lean();
    const byUser = Object.fromEntries((docs || []).map((d) => [String(d.userId), d]));
    res.json({
      success: true,
      people: (people || []).map((p) => {
        const d = byUser[String(p._id)];
        return { userId: p._id, name: p.name, role: p.role, isSet: !!d, weekly: d ? d.weekly : defaultWeek(), offDates: d ? d.offDates : [], note: d ? d.note : '' };
      })
    });
  } catch (error) {
    serverError(res, error, 'List availability');
  }
});

// ---------------------------------------------------------------------------------------------
// Automatic shift allocation
// ---------------------------------------------------------------------------------------------

// @route   POST /api/guards/allocate   (office)
// @desc    Works out who should cover every post for a range of dates. With apply:false it only shows the plan.
router.post(
  '/allocate',
  protect,
  authorize(...OFFICE_ROLES),
  [
    body('from').custom(isValidDate).withMessage('Pick a start date'),
    body('to').custom(isValidDate).withMessage('Pick an end date'),
    body('apply').optional().isBoolean(),
    body('includeHead').optional().isBoolean(),
    body('postIds').optional().isArray({ max: 30 }),
    body('postIds.*').optional().isMongoId(),
    body('options.maxHoursPerDay').optional().isInt({ min: 4, max: 16 }).withMessage('Hours per day must be between 4 and 16'),
    body('options.maxHoursPerWeek').optional().isInt({ min: 20, max: 84 }).withMessage('Hours per week must be between 20 and 84'),
    body('options.minRestHours').optional().isInt({ min: 0, max: 14 }).withMessage('Rest between shifts must be between 0 and 14 hours')
  ],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      const societyId = societyFor(req);
      if (!societyId) return fail(res, 400, 'Choose a society first.');
      const { from, to } = req.body;
      if (to < from) return fail(res, 400, 'The end date is before the start date.');
      const span = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
      if (span > 31) return fail(res, 400, 'Pick a range of 31 days or less.');

      const tz = await societyTz(societyId);
      const today = todayIn(tz);
      if (to < today) return fail(res, 400, 'These dates are in the past.');

      const postFilter = { societyId, isActive: true };
      if (req.body.postIds && req.body.postIds.length) postFilter._id = { $in: req.body.postIds };
      const posts = ((await GuardPost.find(postFilter).sort({ name: 1 }).lean()) || []).filter((p) => (p.slots || []).length);
      if (!posts.length) return fail(res, 400, 'Add a post with at least one time slot first (Guard posts). The plan needs to know where guards are needed.');

      const dates = Array.from({ length: span }, (_, i) => addDays(from, i)).filter((d) => d >= today);
      const guardRoles = req.body.includeHead ? ['security', 'guard_admin'] : ['security'];
      const people = (await User.find({ societyId, role: { $in: [...guardRoles, 'staff'] }, isApproved: true, isActive: true }).select('name role').sort({ name: 1 }).lean()) || [];
      const guards = people.filter((p) => guardRoles.includes(p.role)).map((p) => ({ id: String(p._id), name: p.name }));
      const staff = people.filter((p) => p.role === 'staff').map((p) => ({ id: String(p._id), name: p.name }));

      const availDocs = (await GuardAvailability.find({ societyId, userId: { $in: people.map((p) => p._id) } }).lean()) || [];
      const availability = Object.fromEntries(availDocs.map((d) => [String(d.userId), d]));

      const existing = ((await Shift.find({ societyId, userId: { $in: people.map((p) => p._id) }, date: { $gte: addDays(from, -7), $lte: addDays(to, 1) } }).select('userId date startAt endAt').lean()) || []).map((s) => ({ userId: String(s.userId), date: s.date, startAt: s.startAt, endAt: s.endAt }));

      const options = { ...DEFAULTS, ...(req.body.options || {}) };
      const guardPosts = posts.filter((p) => !STAFF_KINDS.includes(p.kind));
      const staffPosts = posts.filter((p) => STAFF_KINDS.includes(p.kind));
      const parts = [
        { posts: guardPosts, people: guards },
        { posts: staffPosts, people: staff }
      ].filter((p) => p.posts.length);

      const result = { assignments: [], unfilled: [], perGuard: [] };
      for (const part of parts) {
        const r = allocate({ guards: part.people, availability, existing, demands: buildDemands({ posts: part.posts, dates, tz }), options });
        result.assignments.push(...r.assignments);
        result.unfilled.push(...r.unfilled);
        result.perGuard.push(...r.perGuard);
        // Later groups must see what this one handed out.
        r.assignments.forEach((a) => existing.push({ userId: String(a.userId), date: a.date, startAt: a.startAt, endAt: a.endAt }));
      }
      result.assignments.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
      result.unfilled.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));

      const noGuards = !guards.length && guardPosts.length;
      const summary = {
        planned: result.assignments.length,
        unfilledCount: result.unfilled.length,
        message: noGuards ? 'There are no approved guards yet. Approve guards under People first.' : undefined
      };

      if (!req.body.apply) {
        res.json({ success: true, applied: false, ...summary, assignments: result.assignments, unfilled: result.unfilled, perGuard: result.perGuard, from, to });
        return undefined;
      }

      let created = 0;
      let skipped = 0;
      const touched = new Map();
      for (const a of result.assignments) {
        try {
          await Shift.create({
            societyId, userId: a.userId, date: a.date, startTime: a.startTime, endTime: a.endTime, startAt: a.startAt, endAt: a.endAt,
            post: a.post, postId: a.postId, postName: a.postName, note: a.label || '', autoAllocated: true, createdBy: req.user.id
          });
          created += 1;
          touched.set(String(a.userId), (touched.get(String(a.userId)) || 0) + 1);
        } catch (e) {
          if (isDuplicateKey(e)) skipped += 1;
          else throw e;
        }
      }

      const io = req.app.get('io');
      for (const [userId, n] of touched) {
        await safeNotify(io, userId, {
          societyId, type: 'shift', title: 'New shifts planned for you',
          message: `${n} new shift${n === 1 ? '' : 's'} between ${dayText(from)} and ${dayText(to)}. Open My shifts to see them, or ask a colleague to swap.`,
          relatedModel: 'Shift', actionUrl: '/my-shifts'
        });
      }
      const office = (await idsWithRoles(societyId, ['society_admin', 'guard_admin'])).filter((id) => id !== String(req.user.id));
      if (created) {
        await safeNotifyMany(io, office, {
          societyId, type: 'shift', title: 'Shifts were planned automatically',
          message: `${created} shift${created === 1 ? '' : 's'} for ${dayText(from)} to ${dayText(to)}${result.unfilled.length ? `. ${result.unfilled.length} slot${result.unfilled.length === 1 ? '' : 's'} could not be filled.` : '.'}`,
          relatedModel: 'Shift', actionUrl: '/roster'
        });
      }
      res.status(created ? 201 : 200).json({
        success: true, applied: true, created, skipped, ...summary, unfilled: result.unfilled, perGuard: result.perGuard, from, to,
        message: created ? `Planned ${created} shift${created === 1 ? '' : 's'}${skipped ? ` (${skipped} already existed)` : ''}.` : 'Nothing was added.'
      });
      return undefined;
    } catch (error) {
      if (error.name === 'ValidationError') return fail(res, 400, Object.values(error.errors)[0].message);
      return serverError(res, error, 'Auto-allocate shifts');
    }
  }
);

// ---------------------------------------------------------------------------------------------
// Who is on duty now (everyone in the society may see this)
// ---------------------------------------------------------------------------------------------

// @route   GET /api/guards/on-duty
router.get('/on-duty', protect, authorize(...MEMBERS), async (req, res) => {
  try {
    const societyId = societyFor(req);
    if (!societyId) return res.json({ success: true, onDuty: [], desk: null, head: null });
    const [onDuty, head] = await Promise.all([onDutyNow(societyId), guardHead(societyId)]);
    res.json({ success: true, onDuty, desk: pickDesk(onDuty), head, asOf: new Date() });
  } catch (error) {
    serverError(res, error, 'Who is on duty');
  }
});

// ---------------------------------------------------------------------------------------------
// Shift swaps
// ---------------------------------------------------------------------------------------------

const groupOf = (role) => (role === 'staff' ? 'staff' : 'guard');

const presentSwap = (s, viewerId, now = new Date()) => {
  const a = s.requesterShiftId && s.requesterShiftId.date ? s.requesterShiftId : null;
  const b = s.targetShiftId && s.targetShiftId.date ? s.targetShiftId : null;
  const started = (a && a.startAt <= now) || (b && b.startAt <= now);
  const status = s.status === 'pending' && started ? 'expired' : s.status;
  const person = (u) => (u && u.name ? { id: idOf(u), name: u.name, role: u.role } : { id: idOf(u) });
  const me = String(viewerId);
  return {
    _id: s._id,
    status,
    reason: s.reason,
    declineNote: s.declineNote,
    createdAt: s.createdAt,
    decidedAt: s.decidedAt,
    requester: person(s.requesterId),
    target: person(s.targetId),
    requesterShift: presentShift(a),
    targetShift: presentShift(b),
    canAccept: status === 'pending' && idOf(s.targetId) === me,
    canDecline: status === 'pending' && idOf(s.targetId) === me,
    canCancel: status === 'pending' && idOf(s.requesterId) === me
  };
};

const populateSwap = (q) => q.populate('requesterId', 'name role').populate('targetId', 'name role').populate('requesterShiftId').populate('targetShiftId');

// Two shifts may be swapped only if neither has started and the people would not end up double-booked.
const swapProblem = async ({ a, b, requesterId, targetId, societyId, now }) => {
  if (!a || !b) return 'One of the shifts no longer exists.';
  if (idOf(a.userId) !== String(requesterId)) return 'The first shift is no longer yours.';
  if (idOf(b.userId) !== String(targetId)) return 'That shift now belongs to someone else.';
  if (a.clockInAt || b.clockInAt || a.startAt <= now || b.startAt <= now) return 'A shift that has already started cannot be swapped.';
  const clash = async (userId, shift, ignoreId) =>
    Shift.findOne({ societyId, userId, _id: { $ne: ignoreId }, startAt: { $lt: shift.endAt }, endAt: { $gt: shift.startAt } }).select('_id');
  if (await clash(targetId, a, b._id)) return 'The other guard already has a shift at that time.';
  if (await clash(requesterId, b, a._id)) return 'You already have a shift at that time.';
  return null;
};

// @route   GET /api/guards/swaps/options   (guards and staff)
// @desc    Shifts you can offer, and the shifts of colleagues you could ask for.
router.get('/swaps/options', protect, authorize(...DUTY_ROLES), async (req, res) => {
  try {
    const societyId = req.user.societyId;
    const now = new Date();
    const horizon = new Date(now.getTime() + 21 * 86400000);
    const open = new Date(now.getTime() + SWAP_NOTICE_MINUTES * 60000);
    const taken = ((await SwapRequest.find({ societyId, status: 'pending' }).select('requesterShiftId targetShiftId').lean()) || []).flatMap((s) => [String(s.requesterShiftId), String(s.targetShiftId)]);
    const upcoming = (await Shift.find({ societyId, startAt: { $gte: open, $lte: horizon }, clockInAt: { $exists: false } }).populate('userId', 'name role').sort({ startAt: 1 }).limit(600)) || [];
    const myGroup = groupOf(req.user.role);
    const mine = [];
    const others = new Map();
    for (const s of upcoming) {
      if (taken.includes(String(s._id)) || !s.userId) continue;
      if (idOf(s.userId) === String(req.user.id)) {
        mine.push(presentShift(s));
      } else if (groupOf(s.userId.role) === myGroup && DUTY_ROLES.includes(s.userId.role)) {
        const key = idOf(s.userId);
        if (!others.has(key)) others.set(key, { userId: key, name: s.userId.name, shifts: [] });
        others.get(key).shifts.push(presentShift(s));
      }
    }
    res.json({ success: true, mine, others: [...others.values()].sort((a, b) => a.name.localeCompare(b.name)) });
  } catch (error) {
    serverError(res, error, 'Swap options');
  }
});

// @route   GET /api/guards/swaps?box=incoming|sent|all&status=
// @desc    Guards see their own requests; the office (admin, guard head) sees every request in the society.
router.get('/swaps', protect, authorize(...DUTY_ROLES, ...ADMINS), async (req, res) => {
  try {
    const societyId = societyFor(req);
    if (!societyId) return res.json({ success: true, swaps: [] });
    const filter = { societyId };
    const office = OFFICE_ROLES.includes(req.user.role) && req.query.box !== 'mine';
    if (!office) {
      const me = req.user.id;
      if (req.query.box === 'incoming') filter.targetId = me;
      else if (req.query.box === 'sent') filter.requesterId = me;
      else filter.$or = [{ requesterId: me }, { targetId: me }];
    }
    if (req.query.status) filter.status = String(req.query.status);
    const swaps = await populateSwap(SwapRequest.find(filter).sort({ createdAt: -1 }).limit(100));
    const now = new Date();
    res.json({ success: true, swaps: (swaps || []).map((s) => presentSwap(s, req.user.id, now)) });
  } catch (error) {
    serverError(res, error, 'List swap requests');
  }
});

// Who hears about a swap: the other guard (to act), the admin and the guard head, and, once it is done, the other guards. Never residents.
const swapAudience = async (societyId, exceptIds) => {
  const office = await idsWithRoles(societyId, ['society_admin', 'guard_admin']);
  return office.filter((id) => !exceptIds.includes(id));
};

// @route   POST /api/guards/swaps
router.post(
  '/swaps',
  protect,
  authorize(...DUTY_ROLES),
  [
    body('myShiftId').isMongoId().withMessage('Choose your shift'),
    body('theirShiftId').isMongoId().withMessage('Choose the shift you want'),
    body('reason').optional({ nullable: true }).isString().isLength({ max: 200 }).withMessage('Keep the reason under 200 characters')
  ],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      const societyId = req.user.societyId;
      const now = new Date();
      const { myShiftId, theirShiftId } = req.body;
      if (String(myShiftId) === String(theirShiftId)) return fail(res, 400, 'Choose two different shifts.');
      const [a, b] = await Promise.all([Shift.findOne({ _id: myShiftId, societyId }), Shift.findOne({ _id: theirShiftId, societyId }).populate('userId', 'name role isActive isApproved')]);
      if (!a || !b) return fail(res, 404, 'Shift not found');
      if (idOf(a.userId) !== String(req.user.id)) return fail(res, 403, 'You can only offer your own shift.');
      const target = b.userId;
      if (!target || !target.name || idOf(target) === String(req.user.id)) return fail(res, 400, 'Choose a shift that belongs to a colleague.');
      if (!DUTY_ROLES.includes(target.role) || target.isActive === false || target.isApproved === false) return fail(res, 400, 'That person cannot take shifts.');
      if (groupOf(target.role) !== groupOf(req.user.role)) return fail(res, 400, 'You can only swap with someone who does the same kind of work.');
      if (a.startAt < new Date(now.getTime() + SWAP_NOTICE_MINUTES * 60000) || b.startAt < new Date(now.getTime() + SWAP_NOTICE_MINUTES * 60000)) {
        return fail(res, 409, `Ask for a swap at least ${SWAP_NOTICE_MINUTES} minutes before the earlier shift starts.`);
      }
      const problem = await swapProblem({ a, b: { ...b.toObject(), userId: idOf(b.userId), _id: b._id }, requesterId: req.user.id, targetId: idOf(target), societyId, now });
      if (problem) return fail(res, 409, problem);
      const busy = await SwapRequest.findOne({ societyId, status: 'pending', $or: [{ requesterShiftId: { $in: [a._id, b._id] } }, { targetShiftId: { $in: [a._id, b._id] } }] }).select('_id');
      if (busy) return fail(res, 409, 'One of these shifts already has a swap request waiting.');

      const swap = await SwapRequest.create({ societyId, requesterId: req.user.id, targetId: idOf(target), requesterShiftId: a._id, targetShiftId: b._id, reason: (req.body.reason || '').trim() });

      const io = req.app.get('io');
      await safeNotify(io, idOf(target), {
        societyId, type: 'shift_swap', priority: 'high', title: `${first(req.user.name)} wants to swap shifts`,
        message: `They take your ${shiftText(b)} and you take their ${shiftText(a)}.${swap.reason ? ` Reason: ${swap.reason}` : ''} Please accept or decline.`,
        relatedId: swap._id, relatedModel: 'SwapRequest', actionUrl: '/swaps'
      });
      await safeNotifyMany(io, await swapAudience(societyId, [String(req.user.id), idOf(target)]), {
        societyId, type: 'shift_swap', title: 'Shift swap requested',
        message: `${req.user.name} asked ${target.name} to swap: ${shiftText(a)} for ${shiftText(b)}. Waiting for ${first(target.name)} to answer.`,
        relatedId: swap._id, relatedModel: 'SwapRequest', actionUrl: '/swaps'
      });
      res.status(201).json({ success: true, swap: { _id: swap._id, status: swap.status }, message: `Request sent to ${first(target.name)}. Your shifts stay as they are until they accept.` });
      return undefined;
    } catch (error) {
      if (error.name === 'ValidationError') return fail(res, 400, Object.values(error.errors)[0].message);
      return serverError(res, error, 'Create swap request');
    }
  }
);

const loadSwap = (id) => populateSwap(SwapRequest.findById(id));

// @route   PUT /api/guards/swaps/:swapId/accept   (the guard who was asked)
router.put('/swaps/:swapId/accept', protect, authorize(...DUTY_ROLES), async (req, res) => {
  try {
    const swap = await loadSwap(req.params.swapId);
    if (!swap) return fail(res, 404, 'Request not found');
    if (idOf(swap.targetId) !== String(req.user.id)) return fail(res, 403, 'This request is not for you.');
    if (swap.status !== 'pending') return fail(res, 409, `This request was already ${swap.status}.`);

    const now = new Date();
    const societyId = swap.societyId;
    const requesterId = idOf(swap.requesterId);
    const a = swap.requesterShiftId;
    const b = swap.targetShiftId;
    const problem = await swapProblem({ a, b, requesterId, targetId: req.user.id, societyId, now });
    if (problem) {
      swap.status = 'expired';
      swap.decidedAt = now;
      await swap.save();
      return fail(res, 409, `${problem} The request has been closed.`);
    }

    // Move both shifts. Each update checks the shift is still where we expect, so two people acting at once cannot both win.
    const stillFree = (id, owner) => ({ _id: id, userId: owner, clockInAt: { $exists: false }, startAt: { $gt: now } });
    let first1;
    try {
      first1 = await Shift.findOneAndUpdate(stillFree(a._id, requesterId), { $set: { userId: req.user.id, swappedAt: now } }, { new: true });
    } catch (e) {
      if (isDuplicateKey(e)) return fail(res, 409, 'One of you already has a shift at that time.');
      throw e;
    }
    if (!first1) return fail(res, 409, 'The shift changed while you were answering. Nothing was swapped.');
    let second;
    try {
      second = await Shift.findOneAndUpdate(stillFree(b._id, req.user.id), { $set: { userId: requesterId, swappedAt: now } }, { new: true });
    } catch (e) {
      if (!isDuplicateKey(e)) {
        await Shift.updateOne({ _id: a._id }, { $set: { userId: requesterId }, $unset: { swappedAt: 1 } });
        throw e;
      }
    }
    if (!second) {
      await Shift.updateOne({ _id: a._id }, { $set: { userId: requesterId }, $unset: { swappedAt: 1 } });
      return fail(res, 409, 'The shift changed while you were answering. Nothing was swapped.');
    }

    swap.status = 'accepted';
    swap.decidedAt = now;
    await swap.save();

    const io = req.app.get('io');
    const requesterName = swap.requesterId && swap.requesterId.name ? swap.requesterId.name : 'A guard';
    await safeNotify(io, requesterId, {
      societyId, type: 'shift_swap', priority: 'high', title: 'Swap accepted',
      message: `${first(req.user.name)} accepted. You now work ${shiftText(b)}, and ${first(req.user.name)} works ${shiftText(a)}.`,
      relatedId: swap._id, relatedModel: 'SwapRequest', actionUrl: '/my-shifts'
    });
    const office = await swapAudience(societyId, [String(req.user.id), requesterId]);
    await safeNotifyMany(io, office, {
      societyId, type: 'shift_swap', title: 'Shift swap agreed',
      message: `${requesterName} and ${req.user.name} swapped: ${first(requesterName)} now works ${shiftText(b)}; ${first(req.user.name)} works ${shiftText(a)}.`,
      relatedId: swap._id, relatedModel: 'SwapRequest', actionUrl: '/swaps'
    });
    // The other guards and staff get a quiet heads-up so nobody is surprised by who turns up.
    const others = (await idsWithRoles(societyId, DUTY_ROLES)).filter((id) => ![String(req.user.id), requesterId, ...office].includes(id));
    await safeNotifyMany(io, others, {
      societyId, type: 'shift_swap', priority: 'low', title: 'Roster changed',
      message: `${first(requesterName)} and ${first(req.user.name)} swapped shifts on ${dayText(a.date)}${a.date === b.date ? '' : ` and ${dayText(b.date)}`}.`,
      relatedId: swap._id, relatedModel: 'SwapRequest', actionUrl: '/my-shifts'
    });
    res.json({ success: true, message: 'Swapped. Your roster is updated, and the office has been told.' });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'Accept swap');
  }
});

// @route   PUT /api/guards/swaps/:swapId/decline   (the guard who was asked)
router.put('/swaps/:swapId/decline', protect, authorize(...DUTY_ROLES), [body('note').optional({ nullable: true }).isString().isLength({ max: 200 })], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const swap = await loadSwap(req.params.swapId);
    if (!swap) return fail(res, 404, 'Request not found');
    if (idOf(swap.targetId) !== String(req.user.id)) return fail(res, 403, 'This request is not for you.');
    if (swap.status !== 'pending') return fail(res, 409, `This request was already ${swap.status}.`);
    swap.status = 'declined';
    swap.decidedAt = new Date();
    swap.declineNote = (req.body.note || '').trim();
    await swap.save();

    const io = req.app.get('io');
    const requesterId = idOf(swap.requesterId);
    const a = swap.requesterShiftId;
    await safeNotify(io, requesterId, {
      societyId: swap.societyId, type: 'shift_swap', title: 'Swap declined',
      message: `${first(req.user.name)} cannot swap${swap.declineNote ? `: ${swap.declineNote}` : '.'} Your ${a && a.date ? shiftText(a) : 'shift'} stays as planned.`,
      relatedId: swap._id, relatedModel: 'SwapRequest', actionUrl: '/swaps'
    });
    await safeNotifyMany(io, await swapAudience(swap.societyId, [String(req.user.id), requesterId]), {
      societyId: swap.societyId, type: 'shift_swap', priority: 'low', title: 'Shift swap declined',
      message: `${req.user.name} declined to swap with ${swap.requesterId && swap.requesterId.name ? swap.requesterId.name : 'a colleague'}. The roster is unchanged.`,
      relatedId: swap._id, relatedModel: 'SwapRequest', actionUrl: '/swaps'
    });
    res.json({ success: true, message: 'Declined. The roster stays as it was.' });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'Decline swap');
  }
});

// @route   PUT /api/guards/swaps/:swapId/cancel   (the guard who asked)
router.put('/swaps/:swapId/cancel', protect, authorize(...DUTY_ROLES), async (req, res) => {
  try {
    const swap = await loadSwap(req.params.swapId);
    if (!swap) return fail(res, 404, 'Request not found');
    if (idOf(swap.requesterId) !== String(req.user.id)) return fail(res, 403, 'You can only cancel your own request.');
    if (swap.status !== 'pending') return fail(res, 409, `This request was already ${swap.status}.`);
    swap.status = 'cancelled';
    swap.decidedAt = new Date();
    await swap.save();
    await safeNotify(req.app.get('io'), idOf(swap.targetId), {
      societyId: swap.societyId, type: 'shift_swap', priority: 'low', title: 'Swap request withdrawn',
      message: `${first(req.user.name)} withdrew the swap request. Nothing changes for you.`,
      relatedId: swap._id, relatedModel: 'SwapRequest', actionUrl: '/swaps'
    });
    res.json({ success: true, message: 'Request cancelled.' });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'Cancel swap');
  }
});

// ---------------------------------------------------------------------------------------------
// Location while on duty
// ---------------------------------------------------------------------------------------------

// @route   POST /api/guards/ping   (guards, while clocked in)
// @desc    The phone sends its position. Refused when the person is not clocked in, so nothing is recorded off duty.
router.post(
  '/ping',
  protect,
  authorize(...DUTY_ROLES),
  [
    body('lat').isFloat({ min: -90, max: 90 }).withMessage('Location not understood'),
    body('lng').isFloat({ min: -180, max: 180 }).withMessage('Location not understood'),
    body('accuracy').optional({ nullable: true }).isFloat({ min: 0, max: 100000 })
  ],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      const shift = await Shift.findOne({ userId: req.user.id, clockInAt: { $exists: true }, clockOutAt: { $exists: false } }).sort({ startAt: -1 });
      if (!shift) return fail(res, 409, 'You are not on duty, so your location is not being shared.');
      const now = new Date();
      const point = { lat: Number(req.body.lat), lng: Number(req.body.lng), accuracy: req.body.accuracy != null ? Number(req.body.accuracy) : undefined };
      const [society, post] = await Promise.all([Society.findById(shift.societyId).select('location').lean(), shift.postId ? GuardPost.findById(shift.postId).lean() : null]);
      const where = checkPlace(point, placeFor(post, society));

      // A phone can report every few seconds; one point every 15 seconds is plenty.
      if (shift.lastLocation && shift.lastLocation.at && now - new Date(shift.lastLocation.at) < 15000) {
        return res.json({ success: true, recorded: false, ...where });
      }
      await GuardLocation.create({ societyId: shift.societyId, userId: req.user.id, shiftId: shift._id, ...point, at: now });
      await Shift.updateOne({ _id: shift._id }, { $set: { lastLocation: { ...point, at: now } } });
      res.json({ success: true, recorded: true, ...where });
      return undefined;
    } catch (error) {
      return serverError(res, error, 'Guard location ping');
    }
  }
);

// @route   GET /api/guards/live   (admin, guard head)
// @desc    Every guard who is on duty now, where they were last seen, and who should be here but has not clocked in.
router.get('/live', protect, authorize(...OFFICE_ROLES), async (req, res) => {
  try {
    const societyId = societyFor(req);
    if (!societyId) return res.json({ success: true, guards: [], missing: [], location: null, posts: [] });
    const now = new Date();
    const [society, posts, active, due] = await Promise.all([
      Society.findById(societyId).select('name location').lean(),
      GuardPost.find({ societyId, isActive: true }).select('name kind lat lng radiusMeters').lean(),
      Shift.find({ societyId, clockInAt: { $exists: true }, clockOutAt: { $exists: false } }).populate('userId', 'name phone role').sort({ clockInAt: 1 }),
      Shift.find({ societyId, startAt: { $lte: now }, endAt: { $gte: now }, clockInAt: { $exists: false } }).populate('userId', 'name phone role').sort({ startAt: 1 })
    ]);
    const postById = Object.fromEntries((posts || []).map((p) => [String(p._id), p]));
    const guards = (active || []).filter((s) => s.userId).map((s) => {
      const post = s.postId ? postById[String(s.postId)] : null;
      const place = placeFor(post, society);
      const loc = s.lastLocation && s.lastLocation.at ? s.lastLocation : s.clockInLocation && s.clockInLocation.lat != null ? { ...s.clockInLocation, at: s.clockInAt } : null;
      const where = loc ? checkPlace(loc, place) : { distanceM: null, outside: null };
      const ageMinutes = loc && loc.at ? Math.max(0, Math.round((now - new Date(loc.at)) / 60000)) : null;
      return {
        userId: idOf(s.userId), name: s.userId.name, phone: s.userId.phone, role: s.userId.role,
        shiftId: s._id, post: s.post, postName: s.postName || undefined, startTime: s.startTime, endTime: s.endTime, clockInAt: s.clockInAt,
        lat: loc ? loc.lat : null, lng: loc ? loc.lng : null, accuracy: loc ? loc.accuracy : null, seenAt: loc ? loc.at : null,
        ageMinutes, stale: ageMinutes === null ? true : ageMinutes > STALE_MINUTES, distanceM: where.distanceM, outside: where.outside,
        place: place ? { label: place.label, lat: place.lat, lng: place.lng, radiusMeters: place.radiusMeters } : null
      };
    });
    const missing = (due || []).filter((s) => s.userId && DUTY_ROLES.includes(s.userId.role)).map((s) => ({
      userId: idOf(s.userId), name: s.userId.name, phone: s.userId.phone, shiftId: s._id, post: s.post, postName: s.postName || undefined, startTime: s.startTime, endTime: s.endTime,
      lateMinutes: Math.max(0, Math.round((now - s.startAt) / 60000))
    }));
    const loc = society && society.location && isCoord(society.location.lat, society.location.lng) ? society.location : null;
    res.json({ success: true, asOf: now, society: society && society.name, location: loc, posts: (posts || []).filter((p) => isCoord(p.lat, p.lng)), guards, missing, staleAfterMinutes: STALE_MINUTES });
  } catch (error) {
    serverError(res, error, 'Live guards');
  }
});

// @route   GET /api/guards/live/:userId/trail?hours=8   (admin, guard head)
router.get('/live/:userId/trail', protect, authorize(...OFFICE_ROLES), [query('hours').optional().isInt({ min: 1, max: 48 })], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) return fail(res, 404, 'Not found');
    const societyId = societyFor(req);
    if (!societyId) return res.json({ success: true, points: [] });
    const since = new Date(Date.now() - (parseInt(req.query.hours, 10) || 8) * 3600000);
    const points = await GuardLocation.find({ societyId, userId: req.params.userId, at: { $gte: since } }).sort({ at: 1 }).limit(500).select('lat lng accuracy at').lean();
    res.json({ success: true, points: points || [] });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'Guard trail');
  }
});

// ---------------------------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------------------------

// What happened on one shift, in words a person can read.
const attendanceOf = (s, now) => {
  const phase = s.phase(now);
  const lateMinutes = s.clockInAt ? Math.max(0, Math.round((new Date(s.clockInAt) - s.startAt) / 60000)) : 0;
  const worked = s.clockInAt ? ((s.clockOutAt ? new Date(s.clockOutAt) : now < s.endAt ? now : s.endAt) - new Date(s.clockInAt)) / 3600000 : 0;
  let status = phase; // scheduled | on_duty | completed | missed
  if (phase === 'on_duty' || phase === 'completed') status = lateMinutes > GRACE_MINUTES ? `${phase}_late` : phase;
  return {
    _id: s._id, date: s.date, startTime: s.startTime, endTime: s.endTime, post: s.post, postName: s.postName || undefined,
    clockInAt: s.clockInAt, clockOutAt: s.clockOutAt, lateMinutes: lateMinutes > GRACE_MINUTES ? lateMinutes : 0, hoursWorked: Math.max(0, Math.round(worked * 10) / 10),
    phase, status, outsideAtClockIn: s.clockInLocation ? !!s.clockInLocation.outside : undefined, distanceAtClockIn: s.clockInLocation ? s.clockInLocation.distanceM : undefined,
    hasLocation: !!(s.clockInLocation && s.clockInLocation.lat != null)
  };
};

const summarize = (rows) => {
  const due = rows.filter((r) => r.phase !== 'scheduled'); // shifts whose time has come or gone
  const present = due.filter((r) => r.clockInAt).length;
  const missed = due.filter((r) => r.phase === 'missed').length;
  const late = due.filter((r) => r.lateMinutes > 0).length;
  const hours = Math.round(rows.reduce((n, r) => n + r.hoursWorked, 0) * 10) / 10;
  return { scheduled: rows.length, due: due.length, present, missed, late, onTime: Math.max(0, present - late), hoursWorked: hours, attendancePct: due.length ? Math.round((present / due.length) * 100) : null };
};

const rangeFrom = async (req, societyId) => {
  const today = todayIn(await societyTz(societyId));
  const from = req.query.from || addDays(today, -6);
  const to = req.query.to || today;
  return { today, from, to };
};

// @route   GET /api/guards/attendance?from=&to=&userId=   (admin, guard head)
router.get('/attendance', protect, authorize(...OFFICE_ROLES), [query('from').optional().custom(isValidDate), query('to').optional().custom(isValidDate), query('userId').optional().isMongoId()], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const societyId = societyFor(req);
    if (!societyId) return res.json({ success: true, people: [], shifts: [] });
    const { today, from, to } = await rangeFrom(req, societyId);
    if (to < from) return fail(res, 400, 'The end date is before the start date.');
    if (Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) > 92) return fail(res, 400, 'Pick a range of about three months or less.');
    const filter = { societyId, date: { $gte: from, $lte: to } };
    if (req.query.userId) filter.userId = req.query.userId;
    const shifts = (await Shift.find(filter).populate('userId', 'name role phone').sort({ date: 1, startTime: 1 }).limit(3000)) || [];
    const now = new Date();
    const byPerson = new Map();
    for (const s of shifts) {
      if (!s.userId) continue;
      const key = idOf(s.userId);
      if (!byPerson.has(key)) byPerson.set(key, { userId: key, name: s.userId.name, role: s.userId.role, phone: s.userId.phone, rows: [] });
      byPerson.get(key).rows.push(attendanceOf(s, now));
    }
    const people = [...byPerson.values()].map((p) => ({ userId: p.userId, name: p.name, role: p.role, phone: p.phone, ...summarize(p.rows), shifts: p.rows })).sort((a, b) => a.name.localeCompare(b.name));
    const all = people.flatMap((p) => p.shifts);
    res.json({ success: true, from, to, today, totals: summarize(all), people });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'Attendance report');
  }
});

// @route   GET /api/guards/attendance/me?from=&to=   (guards and staff)
router.get('/attendance/me', protect, authorize(...DUTY_ROLES), [query('from').optional().custom(isValidDate), query('to').optional().custom(isValidDate)], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const { today, from, to } = await rangeFrom({ query: { from: req.query.from, to: req.query.to } }, req.user.societyId);
    const defaultFrom = req.query.from ? from : addDays(today, -29);
    if (to < defaultFrom) return fail(res, 400, 'The end date is before the start date.');
    const shifts = (await Shift.find({ userId: req.user.id, date: { $gte: defaultFrom, $lte: to } }).sort({ date: -1, startTime: -1 }).limit(400)) || [];
    const now = new Date();
    const rows = shifts.map((s) => attendanceOf(s, now));
    res.json({ success: true, from: defaultFrom, to, today, summary: summarize(rows), shifts: rows });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'My attendance');
  }
});

module.exports = router;
module.exports.attendanceOf = attendanceOf;
module.exports.distanceM = distanceM;
