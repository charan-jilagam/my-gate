const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const Society = require('../models/Society');
const ServiceProvider = require('../models/ServiceProvider');
const ServiceRequest = require('../models/ServiceRequest');
const { protect, authorize, scopeToSociety } = require('../middleware/auth');
const { CATEGORIES, CATEGORY_KEYS, labelOf } = require('../utils/serviceCatalog');
const { DEFAULT_TZ, isValidDate, todayIn, zonedToUtc } = require('../utils/timezone');
const { buildDaySlots, summarizeDays, nextAvailableSlot, validateAvailability, SLOT_LENGTHS } = require('../utils/slots');
const { presentProvider, presentReview, recommendScore } = require('../utils/presentService');
const { safeNotify } = require('../utils/safeNotify');

router.param('id', scopeToSociety(ServiceProvider));

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const invalid = (req, res) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({ success: false, errors: errors.array() });
  return true;
};
const serverError = (res, error, where) => {
  console.error(`${where}:`, error);
  return fail(res, 500, 'Server error');
};

// Which society a request is about. Super admins have none of their own and pass ?societyId=.
const societyFor = (req) => (req.user.role === 'super_admin' ? req.query.societyId : req.user.societyId);

const societyTz = async (societyId) => {
  const society = await Society.findById(societyId).select('timezone').lean();
  return (society && society.timezone) || DEFAULT_TZ;
};

const groupBy = (list, key) =>
  list.reduce((acc, item) => {
    const k = String(item[key]);
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});

const visibleVendor = (p) => p.userId && p.userId.isApproved && p.userId.isActive !== false;

// ---------------------------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------------------------

// @route   GET /api/services/categories
router.get('/categories', protect, (req, res) => {
  res.json({ success: true, categories: CATEGORIES, slotLengths: SLOT_LENGTHS });
});

// ---------------------------------------------------------------------------------------------
// Vendor: own profile and availability
// ---------------------------------------------------------------------------------------------

// @route   GET /api/services/me
// @desc    The vendor's own service profile (null until they set one up) with a few numbers for their home screen
router.get('/me', protect, authorize('vendor'), async (req, res) => {
  try {
    const profile = await ServiceProvider.findOne({ userId: req.user.id }).lean();
    if (!profile) return res.json({ success: true, profile: null, stats: null });

    const tz = await societyTz(req.user.societyId);
    const now = new Date();
    const today = todayIn(tz, now);
    const monthStart = zonedToUtc(`${today.slice(0, 7)}-01`, '00:00', tz);
    const mine = { providerUserId: req.user.id };

    const [todayJobs, awaiting, upcoming, earned] = await Promise.all([
      ServiceRequest.countDocuments({ ...mine, date: today, status: { $in: ['confirmed', 'on_the_way', 'in_progress'] } }),
      ServiceRequest.countDocuments({ ...mine, status: 'requested' }),
      ServiceRequest.countDocuments({ ...mine, status: { $in: ['confirmed', 'on_the_way'] }, startAt: { $gte: now } }),
      ServiceRequest.aggregate([
        { $match: { providerUserId: profile.userId, status: 'completed', completedAt: { $gte: monthStart } } },
        { $group: { _id: null, jobs: { $sum: 1 }, amount: { $sum: { $ifNull: ['$finalAmount', 0] } } } }
      ])
    ]);

    res.json({
      success: true,
      profile,
      today, // the society's calendar day right now, so the app never has to guess the time zone
      timezone: tz,
      stats: {
        today: todayJobs,
        awaiting,
        upcoming,
        monthJobs: earned[0] ? earned[0].jobs : 0,
        monthEarnings: earned[0] ? earned[0].amount : 0
      }
    });
  } catch (error) {
    serverError(res, error, 'Load vendor profile');
  }
});

const EDITABLE = [
  'categories',
  'bio',
  'experienceYears',
  'visitCharge',
  'priceNote',
  'slotMinutes',
  'weeklySchedule',
  'breakTime',
  'timeOff',
  'minNoticeMinutes',
  'maxAdvanceDays',
  'acceptingJobs',
  'autoAccept'
];

// @route   PUT /api/services/me
// @desc    Create or update the vendor's service profile. Fields that are left out stay as they are.
router.put(
  '/me',
  protect,
  authorize('vendor'),
  [
    body('categories').optional().isArray({ min: 1, max: 5 }).withMessage('Choose between one and five services'),
    body('categories.*').optional().isIn(CATEGORY_KEYS).withMessage('Unknown service'),
    body('bio').optional().isString().isLength({ max: 500 }).withMessage('Keep the introduction under 500 characters'),
    body('experienceYears').optional().isInt({ min: 0, max: 60 }).withMessage('Experience must be between 0 and 60 years'),
    body('visitCharge').optional().isFloat({ min: 0, max: 100000 }).withMessage('Visit charge must be 0 or more'),
    body('priceNote').optional().isString().isLength({ max: 160 }).withMessage('Keep the price note under 160 characters'),
    body('minNoticeMinutes').optional().isInt({ min: 0, max: 1440 }),
    body('maxAdvanceDays').optional().isInt({ min: 1, max: 60 }),
    body('acceptingJobs').optional().isBoolean(),
    body('autoAccept').optional().isBoolean()
  ],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;

      const tz = await societyTz(req.user.societyId);
      const input = req.body;

      const problems = validateAvailability({
        weeklySchedule: input.weeklySchedule,
        breakTime: input.breakTime,
        slotMinutes: input.slotMinutes,
        timeOff: input.timeOff
      });
      if (problems.length) return fail(res, 400, problems[0]);

      let profile = await ServiceProvider.findOne({ userId: req.user.id });
      if (!profile) {
        if (!Array.isArray(input.categories) || !input.categories.length) {
          return fail(res, 400, 'Choose at least one service you offer.');
        }
        profile = new ServiceProvider({ userId: req.user.id, societyId: req.user.societyId });
      }

      EDITABLE.forEach((key) => {
        if (input[key] === undefined) return;
        if (key === 'weeklySchedule') {
          profile.weeklySchedule = input.weeklySchedule.map((d) => ({ day: d.day, enabled: !!d.enabled, start: d.start || '09:00', end: d.end || '18:00' }));
        } else if (key === 'timeOff') {
          // Past days off are just clutter.
          const today = todayIn(tz);
          const seen = new Set();
          profile.timeOff = input.timeOff
            .filter((t) => t.date >= today && !seen.has(t.date) && seen.add(t.date))
            .map((t) => ({ date: t.date, reason: (t.reason || '').toString().slice(0, 80) }))
            .sort((a, b) => a.date.localeCompare(b.date));
        } else if (key === 'breakTime') {
          profile.breakTime = {
            enabled: !!input.breakTime.enabled,
            start: input.breakTime.start || '13:00',
            end: input.breakTime.end || '14:00'
          };
        } else if (key === 'categories') {
          profile.categories = [...new Set(input.categories)];
        } else {
          profile[key] = input[key];
        }
      });

      await profile.save();
      res.json({ success: true, profile, message: 'Your service profile is saved' });
    } catch (error) {
      if (error.name === 'ValidationError') {
        return fail(res, 400, Object.values(error.errors)[0].message);
      }
      return serverError(res, error, 'Save vendor profile');
    }
  }
);

// ---------------------------------------------------------------------------------------------
// Residents (and admins): browse vendors and their free slots
// ---------------------------------------------------------------------------------------------

// @route   GET /api/services/providers?category=&q=&sort=soonest|rating|price
router.get(
  '/providers',
  protect,
  authorize('resident', 'society_admin', 'super_admin'),
  [query('category').optional().isIn(CATEGORY_KEYS), query('sort').optional().isIn(['soonest', 'rating', 'price', 'recommended'])],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      const societyId = societyFor(req);
      if (!societyId) return fail(res, 400, 'Choose a society first.');

      const filter = { societyId, isActive: true };
      if (req.query.category) filter.categories = req.query.category;

      let providers = (await ServiceProvider.find(filter).populate('userId', 'name profilePic isApproved isActive').lean()).filter(visibleVendor);

      const q = String(req.query.q || '').trim().toLowerCase();
      if (q) {
        providers = providers.filter((p) =>
          [p.userId.name, p.bio, ...p.categories.map(labelOf)].some((field) => field && field.toLowerCase().includes(q))
        );
      }

      const tz = await societyTz(societyId);
      const now = new Date();
      const bookings = providers.length
        ? await ServiceRequest.find({ providerId: { $in: providers.map((p) => p._id) }, slotActive: true, startAt: { $gte: now } })
            .select('providerId startAt endAt')
            .lean()
        : [];
      const byProvider = groupBy(bookings, 'providerId');

      // Vendors this resident has already had a finished job with, so "Book again" can lead the list.
      let usedBefore = new Set();
      if (req.user.role === 'resident' && providers.length) {
        const done = await ServiceRequest.find({ residentId: req.user.id, providerId: { $in: providers.map((p) => p._id) }, status: 'completed' }).select('providerId').lean();
        usedBefore = new Set((done || []).map((d) => String(d.providerId)));
      }

      const list = providers.map((p) =>
        presentProvider(p, {
          bookedBefore: usedBefore.has(String(p._id)),
          nextAvailable: nextAvailableSlot({ provider: p, bookings: byProvider[String(p._id)] || [], now, tz, searchDays: Math.min(p.maxAdvanceDays || 14, 14) })
        })
      );

      const sort = req.query.sort || 'soonest';
      const soonest = (p) => (p.nextAvailable ? Date.parse(p.nextAvailable.startAt) : Infinity);
      list.sort((a, b) => {
        if (sort === 'recommended') return recommendScore(b.rating.avg, b.rating.count) - recommendScore(a.rating.avg, a.rating.count) || soonest(a) - soonest(b);
        if (sort === 'rating') return b.rating.avg - a.rating.avg || b.rating.count - a.rating.count || soonest(a) - soonest(b);
        if (sort === 'price') return a.visitCharge - b.visitCharge || soonest(a) - soonest(b);
        return soonest(a) - soonest(b) || b.rating.avg - a.rating.avg;
      });

      res.json({ success: true, count: list.length, providers: list });
    } catch (error) {
      serverError(res, error, 'List providers');
    }
  }
);

// @route   GET /api/services/providers/:id
// @desc    One vendor's public profile with recent reviews
router.get('/providers/:id', protect, authorize('resident', 'society_admin', 'super_admin'), async (req, res) => {
  try {
    const provider = await ServiceProvider.findById(req.params.id).populate('userId', 'name profilePic isApproved isActive').lean();
    if (!provider) return fail(res, 404, 'Vendor not found');
    const isAdmin = ['society_admin', 'super_admin'].includes(req.user.role);
    if (!isAdmin && (!provider.isActive || !visibleVendor(provider))) return fail(res, 404, 'Vendor not found');

    const reviews = await ServiceRequest.find({ providerId: provider._id, rating: { $exists: true } })
      .sort({ reviewedAt: -1 })
      .limit(10)
      .select('rating review reviewedAt category residentId')
      .populate('residentId', 'name flatNo block')
      .lean();

    res.json({
      success: true,
      provider: presentProvider(provider),
      reviews: reviews.map(presentReview),
      timezone: await societyTz(provider.societyId)
    });
  } catch (error) {
    serverError(res, error, 'Get provider');
  }
});

// @route   GET /api/services/providers/:id/slots?date=YYYY-MM-DD
// @desc    Every slot on one day, marking which are free
router.get('/providers/:id/slots', protect, authorize('resident', 'society_admin', 'super_admin'), [query('date').custom(isValidDate).withMessage('Pick a valid date')], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const provider = await ServiceProvider.findById(req.params.id).lean();
    if (!provider || !provider.isActive) return fail(res, 404, 'Vendor not found');

    const tz = await societyTz(provider.societyId);
    const bookings = await ServiceRequest.find({ providerId: provider._id, date: req.query.date, slotActive: true }).select('startAt endAt').lean();
    const day = buildDaySlots({ date: req.query.date, provider, bookings, now: new Date(), tz });
    res.json({ success: true, timezone: tz, ...day });
  } catch (error) {
    serverError(res, error, 'Get slots');
  }
});

// @route   GET /api/services/providers/:id/availability?from=&days=
// @desc    A quick count of free slots per day, for a date picker
router.get(
  '/providers/:id/availability',
  protect,
  authorize('resident', 'society_admin', 'super_admin'),
  [query('from').optional().custom(isValidDate), query('days').optional().isInt({ min: 1, max: 30 })],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      const provider = await ServiceProvider.findById(req.params.id).lean();
      if (!provider || !provider.isActive) return fail(res, 404, 'Vendor not found');

      const tz = await societyTz(provider.societyId);
      const now = new Date();
      const from = req.query.from || todayIn(tz, now);
      const days = Math.min(parseInt(req.query.days, 10) || 14, 30);

      const bookings = await ServiceRequest.find({ providerId: provider._id, slotActive: true, startAt: { $gte: new Date(now.getTime() - 86400000) } })
        .select('startAt endAt')
        .lean();
      res.json({ success: true, timezone: tz, days: summarizeDays({ from, days, provider, bookings, now, tz }) });
    } catch (error) {
      serverError(res, error, 'Get availability');
    }
  }
);

// ---------------------------------------------------------------------------------------------
// Society admins: vet and manage vendors
// ---------------------------------------------------------------------------------------------

// @route   GET /api/services/admin/providers
router.get('/admin/providers', protect, authorize('society_admin', 'super_admin'), async (req, res) => {
  try {
    const societyId = societyFor(req);
    if (!societyId) return fail(res, 400, 'Choose a society first.');

    const providers = await ServiceProvider.find({ societyId }).populate('userId', 'name phone email profilePic isApproved isActive').sort({ createdAt: -1 }).lean();
    const counts = await ServiceRequest.aggregate([
      { $match: { providerId: { $in: providers.map((p) => p._id) } } },
      { $group: { _id: { provider: '$providerId', status: '$status' }, n: { $sum: 1 } } }
    ]);
    const open = {};
    counts.forEach((c) => {
      if (['requested', 'confirmed', 'on_the_way', 'in_progress'].includes(c._id.status)) {
        open[String(c._id.provider)] = (open[String(c._id.provider)] || 0) + c.n;
      }
    });

    res.json({
      success: true,
      count: providers.length,
      providers: providers.map((p) => ({
        ...presentProvider(p),
        isActive: p.isActive,
        phone: p.userId && p.userId.phone,
        email: p.userId && p.userId.email,
        accountApproved: !!(p.userId && p.userId.isApproved),
        openJobs: open[String(p._id)] || 0
      }))
    });
  } catch (error) {
    serverError(res, error, 'Admin list providers');
  }
});

// @route   PUT /api/services/providers/:id/verify
router.put('/providers/:id/verify', protect, authorize('society_admin', 'super_admin'), [body('isVerified').isBoolean().withMessage('isVerified must be true or false')], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const provider = await ServiceProvider.findById(req.params.id);
    if (!provider) return fail(res, 404, 'Vendor not found');
    provider.isVerified = req.body.isVerified === true || req.body.isVerified === 'true';
    await provider.save();

    await safeNotify(req.app.get('io'), provider.userId, {
      societyId: provider.societyId,
      type: 'general',
      title: provider.isVerified ? 'You are now a verified vendor' : 'Verification removed',
      message: provider.isVerified ? 'Residents will see a Verified badge on your profile.' : 'Your Verified badge was removed. Contact the society office for details.',
      actionUrl: '/work/setup'
    });
    res.json({ success: true, provider, message: provider.isVerified ? 'Vendor verified' : 'Verification removed' });
  } catch (error) {
    serverError(res, error, 'Verify provider');
  }
});

// @route   PUT /api/services/providers/:id/status
// @desc    Hide a vendor from residents (or show them again). Existing bookings are left for the admin to handle.
router.put('/providers/:id/status', protect, authorize('society_admin', 'super_admin'), [body('isActive').isBoolean().withMessage('isActive must be true or false')], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const provider = await ServiceProvider.findById(req.params.id);
    if (!provider) return fail(res, 404, 'Vendor not found');
    provider.isActive = req.body.isActive === true || req.body.isActive === 'true';
    await provider.save();

    await safeNotify(req.app.get('io'), provider.userId, {
      societyId: provider.societyId,
      type: 'general',
      title: provider.isActive ? 'You are visible to residents again' : 'Your service listing is paused',
      message: provider.isActive ? 'Residents can book you again.' : 'Residents cannot book you for now. Contact the society office for details.',
      actionUrl: '/work/setup',
      priority: 'high'
    });
    res.json({ success: true, provider, message: provider.isActive ? 'Vendor is visible to residents' : 'Vendor is hidden from residents' });
  } catch (error) {
    serverError(res, error, 'Change provider status');
  }
});

module.exports = router;
