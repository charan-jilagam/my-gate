const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const EmergencyAlert = require('../models/EmergencyAlert');
const EmergencyContact = require('../models/EmergencyContact');
const User = require('../models/User');
const { protect, authorize, scopeToSociety } = require('../middleware/auth');
const { safeNotify, safeNotifyMany } = require('../utils/safeNotify');
const { fail, invalid, serverError, societyFor, flatLabel, paging } = require('../utils/routeKit');

router.param('alertId', scopeToSociety(EmergencyAlert));
router.param('contactId', scopeToSociety(EmergencyContact));

const COOLDOWN_MS = 2 * 60 * 1000; // a second press within two minutes returns the first alert instead of paging everyone again
const RESPONDERS = ['security', 'society_admin', 'super_admin'];
const TYPE_LABEL = { medical: 'Medical emergency', fire: 'Fire', security: 'Security threat', other: 'Emergency' };

const presentAlert = (a) => ({
  _id: a._id,
  type: a.type,
  typeLabel: TYPE_LABEL[a.type] || 'Emergency',
  note: a.note,
  status: a.status,
  flat: flatLabel(a),
  resident: a.userId && a.userId._id ? { name: a.userId.name, phone: a.userId.phone } : null,
  acknowledgedBy: a.acknowledgedBy && a.acknowledgedBy.name ? a.acknowledgedBy.name : undefined,
  acknowledgedAt: a.acknowledgedAt,
  resolvedAt: a.resolvedAt,
  resolutionNote: a.resolutionNote,
  createdAt: a.createdAt
});

// ---- Contacts -------------------------------------------------------------------------------

// @route   GET /api/emergency/contacts
router.get('/contacts', protect, async (req, res) => {
  try {
    const societyId = societyFor(req);
    if (!societyId) return res.json({ success: true, contacts: [] });
    const contacts = await EmergencyContact.find({ societyId }).sort({ sortOrder: 1, name: 1 }).lean();
    res.json({ success: true, contacts });
  } catch (error) {
    serverError(res, error, 'List emergency contacts');
  }
});

const contactRules = [
  body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Enter a name'),
  body('phone').trim().matches(/^[0-9+\-() ]{3,20}$/).withMessage('Enter a valid phone number'),
  body('kind').optional().isIn(EmergencyContact.KINDS).withMessage('Unknown contact type'),
  body('note').optional().isString().isLength({ max: 120 }),
  body('sortOrder').optional().isInt({ min: 0, max: 1000 })
];

// @route   POST /api/emergency/contacts
router.post('/contacts', protect, authorize('society_admin', 'super_admin'), contactRules, async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const societyId = societyFor(req);
    if (!societyId) return fail(res, 400, 'Choose a society first.');
    const { name, phone, kind, note, sortOrder } = req.body;
    const contact = await EmergencyContact.create({ societyId, name, phone, kind, note, sortOrder });
    res.status(201).json({ success: true, contact, message: 'Contact added' });
  } catch (error) {
    serverError(res, error, 'Create emergency contact');
  }
});

// @route   PUT /api/emergency/contacts/:contactId
router.put('/contacts/:contactId', protect, authorize('society_admin', 'super_admin'), contactRules, async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const contact = await EmergencyContact.findById(req.params.contactId);
    if (!contact) return fail(res, 404, 'Contact not found');
    ['name', 'phone', 'kind', 'note', 'sortOrder'].forEach((k) => {
      if (req.body[k] !== undefined) contact[k] = req.body[k];
    });
    await contact.save();
    res.json({ success: true, contact, message: 'Contact saved' });
  } catch (error) {
    serverError(res, error, 'Update emergency contact');
  }
});

// @route   DELETE /api/emergency/contacts/:contactId
router.delete('/contacts/:contactId', protect, authorize('society_admin', 'super_admin'), async (req, res) => {
  try {
    const contact = await EmergencyContact.findById(req.params.contactId);
    if (!contact) return fail(res, 404, 'Contact not found');
    await EmergencyContact.deleteOne({ _id: contact._id });
    res.json({ success: true, message: 'Contact removed' });
  } catch (error) {
    serverError(res, error, 'Delete emergency contact');
  }
});

// ---- SOS ------------------------------------------------------------------------------------

// @route   POST /api/emergency/sos
// @desc    A resident raises an alarm. Guards and admins are notified straight away (with a text message).
router.post(
  '/sos',
  protect,
  authorize('resident'),
  [body('type').optional().isIn(EmergencyAlert.TYPES).withMessage('Unknown emergency type'), body('note').optional().isString().isLength({ max: 300 }).withMessage('Keep the note under 300 characters')],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;

      const recent = await EmergencyAlert.findOne({ userId: req.user.id, status: { $ne: 'resolved' }, createdAt: { $gte: new Date(Date.now() - COOLDOWN_MS) } }).sort({ createdAt: -1 });
      if (recent) return res.json({ success: true, alert: presentAlert(recent), repeated: true, message: 'Help is already on the way. The gate has your alert.' });

      const type = req.body.type || 'other';
      const alert = await EmergencyAlert.create({
        societyId: req.user.societyId,
        userId: req.user.id,
        type,
        note: req.body.note || '',
        flatNo: req.user.flatNo,
        block: req.user.block
      });

      const responders = await User.find({ societyId: req.user.societyId, role: { $in: ['security', 'society_admin'] }, isActive: true, isApproved: true }).select('_id');
      const flat = flatLabel(req.user);
      await safeNotifyMany(req.app.get('io'), responders.map((r) => r._id), {
        societyId: req.user.societyId,
        type: 'sos_alert',
        title: `${TYPE_LABEL[type]} at ${flat || 'a flat'}`,
        message: `${req.user.name}${req.user.phone ? ` (${req.user.phone})` : ''} needs help.${req.body.note ? ` ${req.body.note}` : ''}`,
        relatedId: alert._id,
        relatedModel: 'EmergencyAlert',
        actionUrl: '/emergency',
        priority: 'high',
        sms: true
      });
      alert.notifiedCount = responders.length;
      await alert.save();

      res.status(201).json({
        success: true,
        alert: presentAlert(alert),
        notified: responders.length,
        message: responders.length ? 'Alert sent to the gate and the society office.' : 'Alert recorded, but no guard or admin is set up to receive it. Please call the numbers below.'
      });
    } catch (error) {
      serverError(res, error, 'Raise SOS');
    }
  }
);

// @route   GET /api/emergency/alerts
// @desc    Responders see the society's alerts (open first). Residents see their own.
router.get('/alerts', protect, async (req, res) => {
  try {
    const filter = {};
    if (RESPONDERS.includes(req.user.role)) {
      const societyId = societyFor(req);
      if (!societyId) return res.json({ success: true, alerts: [] });
      filter.societyId = societyId;
      if (req.query.status === 'open') filter.status = { $ne: 'resolved' };
    } else if (req.user.role === 'resident') {
      filter.userId = req.user.id;
    } else {
      return res.json({ success: true, alerts: [] });
    }
    // Open alerts are fetched on their own so a long history can never push one out of the list.
    const { limit } = paging(req, { max: 200, fallback: 50 });
    const load = (extra, n) => EmergencyAlert.find({ ...filter, ...extra }).populate('userId', 'name phone').populate('acknowledgedBy', 'name').sort({ createdAt: -1 }).limit(n);
    const [open, closed] = await Promise.all([load({ status: { $ne: 'resolved' } }, 100), req.query.status === 'open' ? [] : load({ status: 'resolved' }, limit)]);
    const alerts = [...open, ...closed];
    res.json({ success: true, alerts: alerts.map(presentAlert) });
  } catch (error) {
    serverError(res, error, 'List alerts');
  }
});

const respond = (nextStatus) => async (req, res) => {
  try {
    const now = new Date();
    // The status in the filter makes this one atomic step, so two guards cannot both claim the same alert.
    const from = nextStatus === 'acknowledged' ? ['active'] : ['active', 'acknowledged'];
    const change =
      nextStatus === 'acknowledged'
        ? { status: 'acknowledged', acknowledgedBy: req.user.id, acknowledgedAt: now }
        : { status: 'resolved', resolvedBy: req.user.id, resolvedAt: now, resolutionNote: (req.body.note || '').toString().slice(0, 300) };
    const alert = await EmergencyAlert.findOneAndUpdate({ _id: req.params.alertId, status: { $in: from } }, { $set: change }, { new: true });
    if (!alert) {
      const exists = await EmergencyAlert.findById(req.params.alertId).select('status');
      if (!exists) return fail(res, 404, 'Alert not found');
      return fail(res, 409, exists.status === 'resolved' ? 'This alert is already resolved.' : 'Someone has already responded to this alert.');
    }

    await safeNotify(req.app.get('io'), alert.userId, {
      societyId: alert.societyId,
      type: 'sos_alert',
      title: nextStatus === 'acknowledged' ? 'Help is coming' : 'Your alert was closed',
      message: nextStatus === 'acknowledged' ? `${req.user.name} has seen your alert and is on the way.` : alert.resolutionNote || 'The society office marked it resolved.',
      relatedId: alert._id,
      relatedModel: 'EmergencyAlert',
      actionUrl: '/emergency',
      priority: 'high'
    });
    res.json({ success: true, alert: presentAlert(alert), message: nextStatus === 'acknowledged' ? 'Marked as responding' : 'Alert resolved' });
  } catch (error) {
    serverError(res, error, 'Respond to alert');
  }
};

// @route   PUT /api/emergency/alerts/:alertId/acknowledge
router.put('/alerts/:alertId/acknowledge', protect, authorize(...RESPONDERS), respond('acknowledged'));
// @route   PUT /api/emergency/alerts/:alertId/resolve
router.put('/alerts/:alertId/resolve', protect, authorize(...RESPONDERS), [body('note').optional().isString().isLength({ max: 300 })], (req, res, next) => (invalid(req, res) ? undefined : respond('resolved')(req, res, next)));

module.exports = router;
