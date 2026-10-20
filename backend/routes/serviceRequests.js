const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const Society = require('../models/Society');
const ServiceProvider = require('../models/ServiceProvider');
const ServiceRequest = require('../models/ServiceRequest');
const { protect, authorize, scopeToSociety } = require('../middleware/auth');
const { CATEGORY_KEYS, labelOf } = require('../utils/serviceCatalog');
const { DEFAULT_TZ, isValidDate, isValidTime } = require('../utils/timezone');
const { buildDaySlots } = require('../utils/slots');
const { STATUSES, ACTIVE_STATUSES, checkTransition, generateStartOtp, checkOtp, roundRating } = require('../utils/serviceFlow');
const { presentRequest, firstName, flatLabel, humanDate, humanTime } = require('../utils/presentService');
const { createServicePass, withdrawServicePass, moveServicePass } = require('../utils/servicePass');
const { cleanImages } = require('../utils/imageUrl');
const { safeNotify } = require('../utils/safeNotify');
const gateway = require('../utils/gateway');

router.param('id', scopeToSociety(ServiceRequest));

const MAX_ACTIVE_PER_RESIDENT = 8;
const RESIDENT_FIELDS = 'name phone profilePic flatNo block';
const VENDOR_FIELDS = 'name phone profilePic';

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
const isDuplicateKey = (error) => error && (error.code === 11000 || /E11000/.test(error.message || ''));
const SLOT_TAKEN = 'Someone just booked that time. Please pick another slot.';

const societyTz = async (societyId) => {
  const society = await Society.findById(societyId).select('timezone').lean();
  return (society && society.timezone) || DEFAULT_TZ;
};

const loadRequest = (id, { withOtp = false } = {}) => {
  let q = ServiceRequest.findById(id).populate('residentId', RESIDENT_FIELDS).populate('providerUserId', VENDOR_FIELDS);
  if (withOtp) q = q.select('+startOtp');
  return q;
};

const idOf = (value) => String((value && value._id) || value);

const actorOf = (user, request) => {
  if (idOf(request.residentId) === String(user.id)) return 'resident';
  if (idOf(request.providerUserId) === String(user.id)) return 'provider';
  if (['society_admin', 'super_admin'].includes(user.role)) return 'admin';
  return null;
};

const pushHistory = (request, status, by, note) => {
  request.statusHistory.push({ status, at: new Date(), by, note: note || undefined });
};

const whenText = (r) => `${humanDate(r.date)}, ${humanTime(r.startTime)}`;
const link = (r) => `/services/requests/${r._id}`;

// Tell someone about a change on a request. Never throws.
const tell = (req, userId, request, { title, message, priority = 'medium', sms = false, email = false }) =>
  safeNotify(req.app.get('io'), idOf(userId), {
    societyId: request.societyId,
    type: 'service_update',
    title,
    message,
    relatedId: request._id,
    relatedModel: 'ServiceRequest',
    actionUrl: link(request),
    priority,
    sms,
    email
  });

// How vendors have rated each of these residents: { residentId: { avg, count } }. Never fails the request it decorates.
const residentScores = async (ids) => {
  try {
    const unique = [...new Set(ids.filter(Boolean).map(String))].filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (!unique.length) return {};
    const rows = (await ServiceRequest.aggregate([
      { $match: { residentId: { $in: unique.map((id) => new mongoose.Types.ObjectId(id)) }, residentRating: { $exists: true } } },
      { $group: { _id: '$residentId', avg: { $avg: '$residentRating' }, n: { $sum: 1 } } }
    ])) || [];
    return Object.fromEntries(rows.map((r) => [String(r._id), { avg: roundRating(r.avg), count: r.n }]));
  } catch (e) {
    return {};
  }
};

const respond = async (res, req, request, message, status = 200) => {
  const scores = await residentScores([idOf(request.residentId)]);
  return res.status(status).json({
    success: true,
    message,
    request: presentRequest(request, { id: req.user.id, role: req.user.role }, { residentScore: scores[idOf(request.residentId)] })
  });
};

// ---------------------------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------------------------

// @route   POST /api/service-requests
// @desc    Book a vendor's slot
router.post(
  '/',
  protect,
  authorize('resident'),
  [
    body('providerId').isMongoId().withMessage('Choose a vendor'),
    body('category').isIn(CATEGORY_KEYS).withMessage('Choose a service'),
    body('date').custom(isValidDate).withMessage('Pick a valid date'),
    body('startTime').custom(isValidTime).withMessage('Pick a time slot'),
    body('title').trim().isLength({ min: 3, max: 100 }).withMessage('Describe the job in 3 to 100 characters'),
    body('description').optional({ nullable: true }).isString().isLength({ max: 1000 }).withMessage('Keep the details under 1000 characters'),
    body('urgency').optional().isIn(['normal', 'urgent'])
  ],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      const { providerId, category, date, startTime, title, description, urgency, images } = req.body;

      const provider = await ServiceProvider.findById(providerId).populate('userId', 'name phone isApproved isActive');
      const vendorOk = provider && provider.userId && provider.userId.isApproved && provider.userId.isActive !== false;
      if (!provider || !provider.isActive || !vendorOk || String(provider.societyId) !== String(req.user.societyId)) {
        return fail(res, 404, 'That vendor is not available.');
      }
      if (!provider.categories.includes(category)) {
        return fail(res, 400, `This vendor does not offer ${labelOf(category).toLowerCase()}.`);
      }

      const active = await ServiceRequest.countDocuments({ residentId: req.user.id, status: { $in: ACTIVE_STATUSES } });
      if (active >= MAX_ACTIVE_PER_RESIDENT) {
        return fail(res, 400, `You already have ${MAX_ACTIVE_PER_RESIDENT} open service requests. Finish or cancel one first.`);
      }

      const tz = await societyTz(provider.societyId);
      const bookings = await ServiceRequest.find({ providerId: provider._id, date, slotActive: true }).select('startAt endAt').lean();
      const day = buildDaySlots({ date, provider: provider.toObject(), bookings, now: new Date(), tz });
      const slot = day.slots.find((s) => s.start === startTime);
      if (!slot) return fail(res, 400, 'That time is not one of the vendor\'s slots.');
      if (!slot.available) {
        return fail(res, 409, slot.reason === 'booked' ? SLOT_TAKEN : 'That slot is too soon. Pick a later one.');
      }

      const autoAccept = !!provider.autoAccept;
      const request = new ServiceRequest({
        societyId: provider.societyId,
        residentId: req.user.id,
        providerId: provider._id,
        providerUserId: provider.userId._id,
        category,
        title,
        description: description || '',
        images: cleanImages(images, 4),
        urgency: urgency || 'normal',
        flatNo: req.user.flatNo,
        block: req.user.block,
        date,
        startTime: slot.start,
        endTime: slot.end,
        startAt: new Date(slot.startAt),
        endAt: new Date(slot.endAt),
        status: autoAccept ? 'confirmed' : 'requested',
        startOtp: generateStartOtp(),
        visitCharge: provider.visitCharge
      });
      pushHistory(request, 'requested', req.user.id);
      if (autoAccept) pushHistory(request, 'confirmed', provider.userId._id, 'Confirmed automatically');

      try {
        await request.save();
      } catch (error) {
        if (isDuplicateKey(error)) return fail(res, 409, SLOT_TAKEN);
        throw error;
      }

      if (autoAccept) {
        const visitorId = await createServicePass({ request, vendor: provider.userId, resident: req.user });
        if (visitorId) {
          request.visitorId = visitorId;
          await ServiceRequest.updateOne({ _id: request._id }, { visitorId });
        }
      }

      const who = `${firstName(req.user.name)} (${flatLabel(request)})`;
      await tell(req, provider.userId._id, request, {
        title: request.urgency === 'urgent' ? 'Urgent service request' : autoAccept ? 'New booking' : 'New service request',
        message: `${who} needs ${labelOf(category).toLowerCase()}: ${title}. ${whenText(request)}.`,
        priority: request.urgency === 'urgent' ? 'high' : 'medium',
        // The vendor has to act (or prepare), so they are told by text and email as well as in the app.
        sms: true,
        email: true
      });
      // The resident gets a receipt for what they booked, by email too.
      await tell(req, req.user.id, request, autoAccept
        ? { title: 'Booking confirmed', message: `${provider.userId.name} will come on ${whenText(request)}.`, sms: true, email: true }
        : { title: 'Request sent', message: `${provider.userId.name} has your request for ${whenText(request)}. You will be told when they confirm.`, email: true });

      // The creator needs the start code, which the schema hides by default.
      const full = await loadRequest(request._id, { withOtp: true });
      await respond(res, req, full, autoAccept ? 'Booked. Your vendor is confirmed.' : 'Request sent. You will be told when the vendor confirms.', 201);
      return undefined;
    } catch (error) {
      return serverError(res, error, 'Create service request');
    }
  }
);

// ---------------------------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------------------------

// @route   GET /api/service-requests?scope=upcoming|past&status=a,b&date=&limit=&skip=
router.get(
  '/',
  protect,
  authorize('resident', 'vendor', 'society_admin', 'super_admin'),
  [query('scope').optional().isIn(['upcoming', 'past']), query('date').optional().custom(isValidDate)],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      const filter = {};
      if (req.user.role === 'resident') filter.residentId = req.user.id;
      else if (req.user.role === 'vendor') filter.providerUserId = req.user.id;
      else if (req.user.role === 'society_admin') filter.societyId = req.user.societyId;
      else if (req.query.societyId) filter.societyId = req.query.societyId;

      if (req.query.status) {
        const wanted = String(req.query.status).split(',').filter((s) => STATUSES.includes(s));
        if (wanted.length) filter.status = { $in: wanted };
      } else if (req.query.scope === 'upcoming') {
        filter.status = { $in: ACTIVE_STATUSES };
      } else if (req.query.scope === 'past') {
        filter.status = { $in: ['completed', 'cancelled', 'declined'] };
      }
      if (req.query.date) filter.date = req.query.date;
      if (req.query.providerId && req.user.role !== 'resident') filter.providerId = req.query.providerId;

      const upcoming = req.query.scope === 'upcoming';
      const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
      const requests = await ServiceRequest.find(filter)
        .populate('residentId', RESIDENT_FIELDS)
        .populate('providerUserId', VENDOR_FIELDS)
        .sort({ startAt: upcoming ? 1 : -1 })
        .skip(parseInt(req.query.skip, 10) || 0)
        .limit(limit);

      const viewer = { id: req.user.id, role: req.user.role };
      const scores = await residentScores(requests.map((r) => idOf(r.residentId)));
      res.json({ success: true, count: requests.length, requests: requests.map((r) => presentRequest(r, viewer, { residentScore: scores[idOf(r.residentId)] })) });
    } catch (error) {
      serverError(res, error, 'List service requests');
    }
  }
);

// @route   GET /api/service-requests/:id
router.get('/:id', protect, authorize('resident', 'vendor', 'society_admin', 'super_admin'), async (req, res) => {
  try {
    const request = await loadRequest(req.params.id, { withOtp: true });
    if (!request) return fail(res, 404, 'Request not found');
    if (!actorOf(req.user, request)) return fail(res, 403, 'This is not your request.');
    const scores = await residentScores([idOf(request.residentId)]);
    res.json({ success: true, request: presentRequest(request, { id: req.user.id, role: req.user.role }, { residentScore: scores[idOf(request.residentId)] }) });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'Get service request');
  }
});

// ---------------------------------------------------------------------------------------------
// Status changes
// ---------------------------------------------------------------------------------------------

/**
 * Registers PUT /:id/<path> for one step of the life cycle. The shared part (load, who-are-you, is-this-move-allowed,
 * save, respond) lives here; each step supplies:
 *   apply(ctx)  fill in fields for this step, may be async; return { error: [status, message] } to refuse
 *   after(ctx)  side effects once saved: gate pass, notifications, vendor counters
 */
const step = ({ path, to, roles, validators = [], withOtp = false, apply, after, message }) => {
  router.put(`/:id/${path}`, protect, authorize(...roles), validators, async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      const request = await loadRequest(req.params.id, { withOtp });
      if (!request) return fail(res, 404, 'Request not found');

      const actor = actorOf(req.user, request);
      if (!actor) return fail(res, 403, 'This is not your request.');
      const verdict = checkTransition({ actor, from: request.status, to });
      if (!verdict.ok) return fail(res, verdict.code === 'actor' ? 403 : 409, verdict.message);

      const ctx = { req, request, actor, now: new Date(), previous: request.status };
      const refusal = apply ? await apply(ctx) : null;
      if (refusal && refusal.error) return fail(res, refusal.error[0], refusal.error[1]);

      request.status = to;
      pushHistory(request, to, req.user.id, ctx.note);
      await request.save();

      if (after) await after(ctx);
      await respond(res, req, request, typeof message === 'function' ? message(ctx) : message);
      return undefined;
    } catch (error) {
      if (error && error.name === 'ValidationError') return fail(res, 400, Object.values(error.errors)[0].message);
      return serverError(res, error, `Service request ${path}`);
    }
  });
};

step({
  path: 'accept',
  to: 'confirmed',
  roles: ['vendor'],
  message: 'Confirmed. The resident has been told.',
  after: async ({ req, request }) => {
    const visitorId = await createServicePass({ request, vendor: request.providerUserId, resident: request.residentId });
    if (visitorId) {
      request.visitorId = visitorId;
      await ServiceRequest.updateOne({ _id: request._id }, { visitorId });
    }
    await tell(req, request.residentId, request, {
      title: 'Booking confirmed',
      message: `${request.providerUserId.name} will come on ${whenText(request)}. Keep your start code ready.`,
      sms: true,
      email: true
    });
  }
});

step({
  path: 'decline',
  to: 'declined',
  roles: ['vendor'],
  validators: [body('reason').optional({ nullable: true }).isString().isLength({ max: 200 }).withMessage('Keep the reason under 200 characters')],
  message: 'Declined. The resident has been told.',
  apply: ({ req, request }) => {
    request.declineReason = (req.body.reason || '').trim() || undefined;
  },
  after: async ({ req, request }) => {
    await tell(req, request.residentId, request, {
      title: 'Vendor could not take the job',
      message: `${request.providerUserId.name} cannot do ${whenText(request)}${request.declineReason ? `: ${request.declineReason}` : '.'} Please pick another vendor or time.`,
      priority: 'high',
      sms: true,
      email: true
    });
  }
});

step({
  path: 'on-the-way',
  to: 'on_the_way',
  roles: ['vendor'],
  message: 'The resident knows you are on the way.',
  after: async ({ req, request }) => {
    await tell(req, request.residentId, request, {
      title: `${request.providerUserId.name} is on the way`,
      message: 'Keep your start code ready for when they arrive.',
      priority: 'high'
    });
  }
});

step({
  path: 'start',
  to: 'in_progress',
  roles: ['vendor'],
  withOtp: true,
  validators: [body('otp').trim().matches(/^\d{4}$/).withMessage('Enter the 4-digit start code')],
  message: 'Work started.',
  apply: async ({ req, request, now }) => {
    const verdict = checkOtp({ expected: request.startOtp, given: req.body.otp, attempts: request.otpAttempts });
    if (!verdict.ok) {
      request.otpAttempts = (request.otpAttempts || 0) + 1;
      await request.save();
      return { error: [verdict.locked ? 429 : 400, verdict.message] };
    }
    request.startedAt = now;
    request.startOtp = undefined;
    return null;
  },
  after: async ({ req, request }) => {
    await tell(req, request.residentId, request, { title: 'Work has started', message: `${request.providerUserId.name} has started: ${request.title}.` });
  }
});

step({
  path: 'complete',
  to: 'completed',
  roles: ['vendor'],
  validators: [
    body('finalAmount').isFloat({ min: 0, max: 1000000 }).withMessage('Enter the amount for this job (0 if free)'),
    body('workSummary').optional({ nullable: true }).isString().isLength({ max: 500 }).withMessage('Keep the summary under 500 characters'),
    body('paymentStatus').optional().isIn(['paid', 'unpaid']),
    body('paymentMethod').optional().isIn(['cash', 'upi', 'other'])
  ],
  message: 'Job completed. The resident has been asked to rate it.',
  apply: ({ req, request, now }) => {
    const paid = req.body.paymentStatus === 'paid';
    if (paid && !req.body.paymentMethod) return { error: [400, 'Say how you were paid: cash, UPI or other.'] };
    request.finalAmount = Number(req.body.finalAmount);
    request.workSummary = (req.body.workSummary || '').trim() || undefined;
    request.completedAt = now;
    request.paymentStatus = paid ? 'paid' : 'unpaid';
    request.paymentMethod = paid ? req.body.paymentMethod : undefined;
    request.paidAt = paid ? now : undefined;
    return null;
  },
  after: async ({ req, request }) => {
    await ServiceProvider.updateOne({ _id: request.providerId }, { $inc: { jobsCompleted: 1 } });
    const money = request.finalAmount ? ` Amount: ₹${request.finalAmount}${request.paymentStatus === 'paid' ? ' (paid)' : ' (to pay)'}.` : '';
    await tell(req, request.residentId, request, {
      title: 'Job completed',
      message: `${request.providerUserId.name} finished: ${request.title}.${money} Tap to rate your experience.`,
      email: true
    });
  }
});

step({
  path: 'cancel',
  to: 'cancelled',
  roles: ['resident', 'vendor', 'society_admin', 'super_admin'],
  validators: [body('reason').optional({ nullable: true }).isString().isLength({ max: 200 }).withMessage('Keep the reason under 200 characters')],
  message: 'Cancelled.',
  apply: ({ req, request, actor, now }) => {
    const reason = (req.body.reason || '').trim();
    if (actor !== 'resident' && reason.length < 3) return { error: [400, 'Please give a short reason so the resident understands.'] };
    request.cancelledBy = actor;
    request.cancelReason = reason || undefined;
    request.cancelledAt = now;
    return null;
  },
  after: async ({ req, request, actor }) => {
    await withdrawServicePass(request.visitorId, 'Service booking cancelled');
    const why = request.cancelReason ? ` Reason: ${request.cancelReason}` : '';
    if (actor === 'resident') {
      await tell(req, request.providerUserId, request, {
        title: 'Booking cancelled',
        message: `${firstName(request.residentId.name)} (${flatLabel(request)}) cancelled ${whenText(request)}.${why}`,
        sms: true,
        email: true
      });
    } else {
      await tell(req, request.residentId, request, {
        title: 'Booking cancelled',
        message: `Your ${labelOf(request.category).toLowerCase()} booking for ${whenText(request)} was cancelled${actor === 'admin' ? ' by the society office' : ' by the vendor'}.${why}`,
        priority: 'high',
        sms: true,
        email: true
      });
      if (actor === 'admin') {
        await tell(req, request.providerUserId, request, { title: 'Booking cancelled by the society office', message: `${request.title} on ${whenText(request)}.${why}`, sms: true, email: true });
      }
    }
  }
});

// ---------------------------------------------------------------------------------------------
// Things that are not a plain status change
// ---------------------------------------------------------------------------------------------

// @route   PUT /api/service-requests/:id/reschedule
// @desc    Move a booking to another free slot with the same vendor
router.put(
  '/:id/reschedule',
  protect,
  authorize('resident'),
  [body('date').custom(isValidDate).withMessage('Pick a valid date'), body('startTime').custom(isValidTime).withMessage('Pick a time slot')],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      const request = await loadRequest(req.params.id, { withOtp: true });
      if (!request) return fail(res, 404, 'Request not found');
      if (idOf(request.residentId) !== String(req.user.id)) return fail(res, 403, 'This is not your request.');
      if (!['requested', 'confirmed'].includes(request.status)) return fail(res, 409, 'Only a booking that has not started can be moved.');

      const provider = await ServiceProvider.findById(request.providerId);
      if (!provider || !provider.isActive) return fail(res, 409, 'This vendor is not taking bookings right now. Cancel and book someone else.');

      const { date, startTime } = req.body;
      if (date === request.date && startTime === request.startTime) return fail(res, 400, 'That is already your slot.');

      const tz = await societyTz(provider.societyId);
      const bookings = await ServiceRequest.find({ providerId: provider._id, date, slotActive: true, _id: { $ne: request._id } }).select('startAt endAt').lean();
      const day = buildDaySlots({ date, provider: provider.toObject(), bookings, now: new Date(), tz });
      const slot = day.slots.find((s) => s.start === startTime);
      if (!slot) return fail(res, 400, 'That time is not one of the vendor\'s slots.');
      if (!slot.available) return fail(res, 409, slot.reason === 'booked' ? SLOT_TAKEN : 'That slot is too soon. Pick a later one.');

      const wasConfirmed = request.status === 'confirmed';
      const before = whenText(request);
      request.date = date;
      request.startTime = slot.start;
      request.endTime = slot.end;
      request.startAt = new Date(slot.startAt);
      request.endAt = new Date(slot.endAt);

      // A vendor who confirms by hand has to confirm the new time too.
      const needsReconfirm = wasConfirmed && !provider.autoAccept;
      if (needsReconfirm) {
        request.status = 'requested';
        await withdrawServicePass(request.visitorId, 'Service booking moved');
        request.visitorId = undefined;
      }
      pushHistory(request, request.status, req.user.id, `Moved from ${before} to ${whenText(request)}`);

      try {
        await request.save();
      } catch (error) {
        if (isDuplicateKey(error)) return fail(res, 409, SLOT_TAKEN);
        throw error;
      }
      if (wasConfirmed && !needsReconfirm) await moveServicePass(request.visitorId, request.startAt);

      await tell(req, request.providerUserId, request, {
        title: needsReconfirm ? 'Booking moved: please confirm' : 'Booking moved',
        message: `${firstName(request.residentId.name)} (${flatLabel(request)}) moved ${before} to ${whenText(request)}.`,
        priority: 'high',
        sms: needsReconfirm, // only a booking that needs the vendor to confirm again is worth a text
        email: true
      });
      await respond(res, req, request, needsReconfirm ? 'Moved. The vendor needs to confirm the new time.' : 'Moved to the new time.');
      return undefined;
    } catch (error) {
      return serverError(res, error, 'Reschedule service request');
    }
  }
);

// @route   PUT /api/service-requests/:id/payment
// @desc    Vendor records that a completed job has been paid for
router.put(
  '/:id/payment',
  protect,
  authorize('vendor'),
  [body('paymentMethod').isIn(['cash', 'upi', 'other']).withMessage('Say how you were paid: cash, UPI or other.')],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      const request = await loadRequest(req.params.id);
      if (!request) return fail(res, 404, 'Request not found');
      if (idOf(request.providerUserId) !== String(req.user.id)) return fail(res, 403, 'This is not your job.');
      if (request.status !== 'completed') return fail(res, 409, 'Only a completed job can be marked paid.');
      if (request.paymentStatus === 'paid') return fail(res, 409, 'This job is already marked paid.');

      request.paymentStatus = 'paid';
      request.paymentMethod = req.body.paymentMethod;
      request.paidAt = new Date();
      await request.save();

      await tell(req, request.residentId, request, {
        title: 'Payment received',
        message: `${request.providerUserId.name} marked ₹${request.finalAmount || 0} as paid (${req.body.paymentMethod}).`,
        email: true
      });
      await respond(res, req, request, 'Marked as paid.');
      return undefined;
    } catch (error) {
      return serverError(res, error, 'Mark service request paid');
    }
  }
);

// @route   POST /api/service-requests/:id/pay-online
// @desc    Resident starts an online payment for a completed job. Returns a Razorpay order to open checkout with.
router.post('/:id/pay-online', protect, authorize('resident'), async (req, res) => {
  try {
    const razorpay = gateway.client();
    if (!razorpay) return fail(res, 503, 'Online payment is not set up for this society. Pay the vendor directly.');
    const request = await loadRequest(req.params.id);
    if (!request) return fail(res, 404, 'Request not found');
    if (idOf(request.residentId) !== String(req.user.id)) return fail(res, 403, 'This is not your booking.');
    if (request.status !== 'completed') return fail(res, 409, 'You can pay once the vendor completes the job.');
    if (request.paymentStatus === 'paid') return fail(res, 409, 'This job is already paid.');
    if (!(Number(request.finalAmount) >= 1)) return fail(res, 409, 'There is no amount to pay.');

    const order = await razorpay.orders.create({
      amount: Math.round(request.finalAmount * 100),
      currency: 'INR',
      receipt: `svc_${request._id}`,
      notes: { serviceRequestId: String(request._id), residentId: String(req.user.id) }
    });
    // Remember which order belongs to this job, so a signature for some other order cannot mark it paid.
    await ServiceRequest.updateOne({ _id: request._id, paymentStatus: { $ne: 'paid' } }, { $set: { razorpayOrderId: order.id } });
    res.json({ success: true, order: { id: order.id, amount: order.amount, currency: order.currency }, keyId: process.env.RAZORPAY_KEY_ID });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'Start service payment');
  }
});

// @route   POST /api/service-requests/:id/pay-verify
// @desc    Resident confirms the payment. The signature proves Razorpay (not the browser) says it was paid.
router.post(
  '/:id/pay-verify',
  protect,
  authorize('resident'),
  [body('razorpay_order_id').isString().notEmpty(), body('razorpay_payment_id').isString().notEmpty(), body('razorpay_signature').isString().notEmpty()],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      if (!gateway.enabled()) return fail(res, 503, 'Online payment is not set up for this society.');
      const request = await ServiceRequest.findById(req.params.id).select('+razorpayOrderId');
      if (!request) return fail(res, 404, 'Request not found');
      if (idOf(request.residentId) !== String(req.user.id)) return fail(res, 403, 'This is not your booking.');
      if (request.paymentStatus === 'paid') return fail(res, 409, 'This job is already paid.');

      const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
      if (!request.razorpayOrderId || request.razorpayOrderId !== orderId || !gateway.signatureOk(orderId, paymentId, signature)) {
        return fail(res, 400, 'We could not verify that payment. If money left your account, contact the society office with the payment id.');
      }

      const paid = await ServiceRequest.findOneAndUpdate(
        { _id: request._id, paymentStatus: { $ne: 'paid' } },
        { $set: { paymentStatus: 'paid', paymentMethod: 'online', paidAt: new Date(), razorpayPaymentId: paymentId } },
        { new: true }
      );
      if (!paid) return fail(res, 409, 'This job is already paid.');

      const fresh = await loadRequest(request._id);
      await tell(req, fresh.providerUserId, fresh, { title: 'Paid online', message: `${fresh.residentId.name} paid ₹${fresh.finalAmount || 0} online for ${fresh.title}.`, sms: true, email: true });
      await respond(res, req, fresh, 'Payment received. Thank you!');
      return undefined;
    } catch (error) {
      return serverError(res, error, 'Verify service payment');
    }
  }
);

// @route   PUT /api/service-requests/:id/review
// @desc    Rate a completed job (once)
router.put(
  '/:id/review',
  protect,
  authorize('resident'),
  [
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Choose between 1 and 5 stars'),
    body('review').optional({ nullable: true }).isString().isLength({ max: 500 }).withMessage('Keep the review under 500 characters')
  ],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      const request = await loadRequest(req.params.id);
      if (!request) return fail(res, 404, 'Request not found');
      if (idOf(request.residentId) !== String(req.user.id)) return fail(res, 403, 'This is not your request.');
      if (request.status !== 'completed') return fail(res, 409, 'You can rate a job once it is completed.');
      if (request.rating) return fail(res, 409, 'You have already rated this job.');

      request.rating = Number(req.body.rating);
      request.review = (req.body.review || '').trim() || undefined;
      request.reviewedAt = new Date();
      await request.save();

      // Recount from the reviews themselves so the average can never drift.
      const [agg] = await ServiceRequest.aggregate([
        { $match: { providerId: request.providerId, rating: { $exists: true } } },
        { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } }
      ]);
      if (agg) await ServiceProvider.updateOne({ _id: request.providerId }, { ratingAvg: roundRating(agg.avg), ratingCount: agg.n });

      await safeNotify(req.app.get('io'), idOf(request.providerUserId), {
        societyId: request.societyId,
        type: 'service_review',
        title: `You got ${request.rating} ${request.rating === 1 ? 'star' : 'stars'}`,
        message: `${firstName(request.residentId.name)} rated ${request.title}${request.review ? `: "${request.review.slice(0, 80)}"` : '.'}`,
        relatedId: request._id,
        relatedModel: 'ServiceRequest',
        actionUrl: link(request)
      });
      await respond(res, req, request, 'Thanks for rating.');
      return undefined;
    } catch (error) {
      return serverError(res, error, 'Review service request');
    }
  }
);

// @route   PUT /api/service-requests/:id/rate-resident
// @desc    The vendor rates the resident after a completed job (once). Private: other vendors and the office can see it, the resident cannot.
router.put(
  '/:id/rate-resident',
  protect,
  authorize('vendor'),
  [
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Choose between 1 and 5 stars'),
    body('review').optional({ nullable: true }).isString().isLength({ max: 300 }).withMessage('Keep the comment under 300 characters')
  ],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      const request = await loadRequest(req.params.id);
      if (!request) return fail(res, 404, 'Request not found');
      if (idOf(request.providerUserId) !== String(req.user.id)) return fail(res, 403, 'This is not your job.');
      if (request.status !== 'completed') return fail(res, 409, 'You can rate the resident once the job is completed.');
      if (request.residentRating) return fail(res, 409, 'You have already rated this resident.');

      request.residentRating = Number(req.body.rating);
      request.residentReview = (req.body.review || '').trim() || undefined;
      request.residentRatedAt = new Date();
      await request.save();

      // Deliberately no notification: the resident is not told about this rating, and cannot see it.
      await respond(res, req, request, 'Thanks for rating.');
      return undefined;
    } catch (error) {
      return serverError(res, error, 'Review service request');
    }
  }
);

// @route   PUT /api/service-requests/:id/rate-resident
// @desc    The vendor rates the resident after a completed job (once). Private: other vendors and the office can see it, the resident cannot.
router.put(
  '/:id/rate-resident',
  protect,
  authorize('vendor'),
  [
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Choose between 1 and 5 stars'),
    body('review').optional({ nullable: true }).isString().isLength({ max: 300 }).withMessage('Keep the comment under 300 characters')
  ],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      const request = await loadRequest(req.params.id);
      if (!request) return fail(res, 404, 'Request not found');
      if (idOf(request.providerUserId) !== String(req.user.id)) return fail(res, 403, 'This is not your job.');
      if (request.status !== 'completed') return fail(res, 409, 'You can rate the resident once the job is completed.');
      if (request.residentRating) return fail(res, 409, 'You have already rated this resident.');

      request.residentRating = Number(req.body.rating);
      request.residentReview = (req.body.review || '').trim() || undefined;
      request.residentRatedAt = new Date();
      await request.save();

      await safeNotify(req.app.get('io'), idOf(request.residentId), {
        societyId: request.societyId,
        type: 'service_review',
        title: `${firstName(request.providerUserId.name)} rated you ${request.residentRating} ${request.residentRating === 1 ? 'star' : 'stars'}`,
        message: `For ${request.title}${request.residentReview ? `: "${request.residentReview.slice(0, 80)}"` : '.'}`,
        relatedId: request._id,
        relatedModel: 'ServiceRequest',
        actionUrl: link(request)
      });
      await respond(res, req, request, 'Thanks for rating.');
      return undefined;
    } catch (error) {
      return serverError(res, error, 'Rate resident');
    }
  }
);

module.exports = router;
