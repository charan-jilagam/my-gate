const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const Occasion = require('../models/Occasion');
const User = require('../models/User');
const { protect, authorize, scopeToSociety } = require('../middleware/auth');
const { safeNotifyMany } = require('../utils/safeNotify');
const { fail, invalid, serverError, societyFor, isSafeUrl, paging } = require('../utils/routeKit');
const { isValidDate } = require('../utils/timezone');

router.param('id', scopeToSociety(Occasion));

const ADMINS = ['society_admin', 'super_admin'];
const WRITERS = [...ADMINS, 'staff'];
const READERS = ['resident', 'security', 'guard_admin', ...WRITERS];
const MAX_PHOTOS = 24;
const MAX_HIGHLIGHTS = 8;

const photoOf = (p) => ({ url: p.url, caption: p.caption || '' });

// The list shows a cover and a few more pictures; the full gallery is loaded when an occasion is opened.
const summary = (o) => ({
  _id: o._id,
  title: o.title,
  kind: o.kind,
  date: o.date,
  endDate: o.endDate || null,
  venue: o.venue,
  hostedBy: o.hostedBy,
  attendees: o.attendees ?? null,
  description: String(o.description || '').slice(0, 200),
  cover: o.photos && o.photos[0] ? o.photos[0].url : null,
  preview: (o.photos || []).slice(1, 4).map((p) => p.url),
  photoCount: (o.photos || []).length,
  createdBy: o.createdBy && o.createdBy._id ? { _id: o.createdBy._id, name: o.createdBy.name } : o.createdBy,
  createdAt: o.createdAt
});

const full = (o) => ({ ...summary(o), description: o.description, highlights: o.highlights || [], photos: (o.photos || []).map(photoOf) });

const rules = [
  body('title').trim().isLength({ min: 2, max: 120 }).withMessage('Give the occasion a name'),
  body('kind').optional().isIn(Occasion.KINDS).withMessage('Unknown type of occasion'),
  body('date').custom((v) => isValidDate(v)).withMessage('Choose the date of the occasion'),
  body('endDate').optional({ nullable: true, checkFalsy: true }).custom((v) => isValidDate(v)).withMessage('Choose a valid last day'),
  body('description').optional().isString().isLength({ max: 2000 }).withMessage('Keep the description under 2000 characters'),
  body('venue').optional().isString().isLength({ max: 120 }).withMessage('Keep the venue under 120 characters'),
  body('hostedBy').optional().isString().isLength({ max: 120 }).withMessage('Keep "organised by" under 120 characters'),
  body('attendees').optional({ nullable: true, checkFalsy: true }).isInt({ min: 0, max: 100000 }).withMessage('Attendance must be a number'),
  body('highlights').optional().isArray({ max: MAX_HIGHLIGHTS }).withMessage(`Add at most ${MAX_HIGHLIGHTS} highlights`),
  body('highlights.*').optional().isString().isLength({ max: 140 }).withMessage('Keep each highlight under 140 characters'),
  body('photos').optional().isArray({ max: MAX_PHOTOS }).withMessage(`Add at most ${MAX_PHOTOS} photos`),
  body('photos.*.url').custom(isSafeUrl).withMessage('One of the photos has an invalid link'),
  body('photos.*.caption').optional().isString().isLength({ max: 140 }).withMessage('Keep each caption under 140 characters')
];

const apply = (o, b) => {
  ['title', 'kind', 'description', 'venue', 'hostedBy'].forEach((k) => {
    if (b[k] !== undefined) o[k] = typeof b[k] === 'string' ? b[k].trim() : b[k];
  });
  if (b.date !== undefined) o.date = b.date;
  if (b.endDate !== undefined) o.endDate = b.endDate || undefined;
  if (b.attendees !== undefined) o.attendees = b.attendees === '' || b.attendees === null ? undefined : Number(b.attendees);
  if (b.highlights !== undefined) o.highlights = b.highlights.map((h) => String(h).trim()).filter(Boolean);
  if (b.photos !== undefined) o.photos = b.photos.map((p) => ({ url: p.url, caption: String(p.caption || '').trim() }));
};

// Staff can change what they added themselves; the society office can change anything.
const mayChange = (req, o) => ADMINS.includes(req.user.role) || String(o.createdBy && o.createdBy._id ? o.createdBy._id : o.createdBy) === String(req.user.id);

// @route   GET /api/occasions?kind=&year=
// @desc    The society's occasions, newest first. Everyone in the society can look.
router.get('/', protect, authorize(...READERS), [query('kind').optional().isIn(Occasion.KINDS), query('year').optional().matches(/^\d{4}$/)], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const societyId = societyFor(req);
    if (!societyId) return res.json({ success: true, occasions: [] });
    const filter = { societyId };
    if (req.query.kind) filter.kind = req.query.kind;
    if (req.query.year) filter.date = { $regex: `^${req.query.year}-` };
    const { limit, skip } = paging(req, { max: 100, fallback: 60 });
    const rows = await Occasion.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit).populate('createdBy', 'name').lean();
    res.json({ success: true, occasions: rows.map(summary), canAdd: WRITERS.includes(req.user.role) });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'List occasions');
  }
});

// @route   GET /api/occasions/:id
router.get('/:id', protect, authorize(...READERS), async (req, res) => {
  try {
    const o = await Occasion.findById(req.params.id).populate('createdBy', 'name').lean();
    if (!o) return fail(res, 404, 'Occasion not found');
    res.json({ success: true, occasion: full(o), canChange: mayChange(req, o) });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'Get occasion');
  }
});

// @route   POST /api/occasions
// @desc    The office or staff adds an occasion with its details and photos. Residents are told.
router.post('/', protect, authorize(...WRITERS), [...rules, body('notify').optional().isBoolean()], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const societyId = societyFor(req);
    if (!societyId) return fail(res, 400, 'Choose a society first.');
    if (req.body.endDate && req.body.endDate < req.body.date) return fail(res, 400, 'The last day cannot be before the first day.');
    const occasion = new Occasion({ societyId, createdBy: req.user.id, title: req.body.title.trim(), date: req.body.date });
    apply(occasion, req.body);
    await occasion.save();

    if (req.body.notify !== false) {
      try {
        const people = await User.find({ societyId, role: { $in: ['resident', 'security', 'guard_admin', 'staff'] }, isApproved: true, isActive: true }).select('_id').lean();
        await safeNotifyMany(req.app.get('io'), people.filter((p) => String(p._id) !== String(req.user.id)).map((p) => p._id), {
          societyId,
          type: 'occasion',
          title: occasion.photos.length ? 'New occasion photos' : 'New occasion',
          message: `${occasion.title} was added to Occasions${occasion.photos.length ? ` with ${occasion.photos.length} photo${occasion.photos.length === 1 ? '' : 's'}` : ''}.`,
          relatedId: occasion._id,
          relatedModel: 'Occasion',
          actionUrl: `/occasions/${occasion._id}`,
          priority: 'low'
        });
      } catch (e) {
        console.error('Occasion notice failed:', e.message); // it is saved; telling people is best effort
      }
    }
    res.status(201).json({ success: true, occasion: full(occasion), message: 'Occasion added' });
    return undefined;
  } catch (error) {
    if (error.name === 'ValidationError') return fail(res, 400, Object.values(error.errors)[0].message);
    return serverError(res, error, 'Create occasion');
  }
});

// @route   PUT /api/occasions/:id
router.put('/:id', protect, authorize(...WRITERS), rules, async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const o = await Occasion.findById(req.params.id);
    if (!o) return fail(res, 404, 'Occasion not found');
    if (!mayChange(req, o)) return fail(res, 403, 'Staff can only change occasions they added.');
    const date = req.body.date !== undefined ? req.body.date : o.date;
    const end = req.body.endDate !== undefined ? req.body.endDate : o.endDate;
    if (end && end < date) return fail(res, 400, 'The last day cannot be before the first day.');
    apply(o, req.body);
    await o.save();
    res.json({ success: true, occasion: full(o), message: 'Occasion saved' });
    return undefined;
  } catch (error) {
    if (error.name === 'ValidationError') return fail(res, 400, Object.values(error.errors)[0].message);
    return serverError(res, error, 'Update occasion');
  }
});

// @route   DELETE /api/occasions/:id
router.delete('/:id', protect, authorize(...WRITERS), async (req, res) => {
  try {
    const o = await Occasion.findById(req.params.id).select('_id createdBy');
    if (!o) return fail(res, 404, 'Occasion not found');
    if (!mayChange(req, o)) return fail(res, 403, 'Staff can only remove occasions they added.');
    await Occasion.deleteOne({ _id: o._id });
    res.json({ success: true, message: 'Occasion removed' });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'Delete occasion');
  }
});

module.exports = router;
