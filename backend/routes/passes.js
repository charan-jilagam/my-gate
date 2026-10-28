const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, query } = require('express-validator');
const mongoose = require('mongoose');
const EntryPass = require('../models/EntryPass');
const MemberLog = require('../models/MemberLog');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { safeNotifyMany, safeNotify } = require('../utils/safeNotify');
const { fail, invalid, serverError, societyFor, paging, flatLabel } = require('../utils/routeKit');
const mp = require('../utils/memberPass');

const router = express.Router();

// Permanent entry passes for people: family members and the head of the house, and also guards, staff and admins.
// The pass is a QR (and a typed code). Scanning it at the gate shows who the person is and records them coming in or going out.

const GATE_ROLES = ['security', 'guard_admin', 'society_admin', 'super_admin'];

// The code is 64 random bits, but a gate screen should still never allow fast guessing.
const guessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user ? req.user.id : req.ip),
  validate: false,
  message: { success: false, message: 'Too many unknown passes. Please wait 15 minutes and try again.' }
});

const passBody = async (user, pass) => ({
  code: pass.code,
  displayCode: mp.display(pass.code),
  version: pass.version,
  regeneratedAt: pass.regeneratedAt || null,
  qrCodeImage: await mp.qrImage(pass),
  person: await mp.present(user, await mp.lastEvent(user._id))
});

// @route   GET /api/passes/me
// @desc    My own permanent pass (made the first time it is opened)
router.get('/me', protect, async (req, res) => {
  try {
    const pass = await mp.ensurePass(req.user);
    return res.json({ success: true, pass: await passBody(req.user, pass) });
  } catch (error) {
    return serverError(res, error, 'My pass');
  }
});

// Loads the person a pass request is about, checking the caller may manage them. Sends the error and returns null otherwise.
const targetFor = async (req, res) => {
  const id = req.params.userId;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    fail(res, 404, 'Person not found');
    return null;
  }
  const user = await User.findById(id);
  if (!user || (req.user.role !== 'super_admin' && String(user.societyId) !== String(req.user.societyId))) {
    fail(res, 404, 'Person not found');
    return null;
  }
  if (!mp.canManagePass(req.user, user)) {
    fail(res, 403, 'You cannot manage this person’s pass.');
    return null;
  }
  return user;
};

// @route   GET /api/passes/user/:userId
// @desc    Someone else's pass: a family member (by the head of the house), or anyone (by the society admin)
router.get('/user/:userId', protect, async (req, res) => {
  try {
    const user = await targetFor(req, res);
    if (!user) return undefined;
    const pass = await mp.ensurePass(user);
    return res.json({ success: true, pass: await passBody(user, pass) });
  } catch (error) {
    return serverError(res, error, 'Person pass');
  }
});

// @route   POST /api/passes/user/:userId/regenerate
// @desc    Replace the pass with a new one. The old QR stops working at once.
router.post('/user/:userId/regenerate', protect, async (req, res) => {
  try {
    const user = await targetFor(req, res);
    if (!user) return undefined;
    if (user.isActive === false) return fail(res, 400, 'This account is switched off.');
    const pass = await mp.regenerate(user, req.user._id);
    if (String(user._id) !== String(req.user._id)) {
      await safeNotify(req.app.get('io'), user._id, {
        societyId: user.societyId,
        type: 'general',
        title: 'Your entry pass was replaced',
        message: `${req.user.name} made you a new entry pass. The old one no longer works. Open My Pass to see the new one.`,
        actionUrl: '/my-pass',
        priority: 'medium'
      });
    }
    return res.json({ success: true, message: 'New pass made. The old one no longer works.', pass: await passBody(user, pass) });
  } catch (error) {
    return serverError(res, error, 'Regenerate pass');
  }
});

// @route   GET /api/passes/user/:userId/history
// @desc    A person's recent comings and goings
router.get('/user/:userId/history', protect, async (req, res) => {
  try {
    const user = await targetFor(req, res);
    if (!user) return undefined;
    const { limit } = paging(req, { max: 100, fallback: 30 });
    const events = await MemberLog.find({ userId: user._id }).sort({ at: -1 }).limit(limit).lean();
    return res.json({ success: true, events });
  } catch (error) {
    return serverError(res, error, 'Pass history');
  }
});

// ---- At the gate ----

// Finds the pass and person for a scanned or typed code. Sends the error and returns null when it cannot.
const resolve = async (req, res) => {
  const code = mp.parseCode(req.body.code);
  if (!code) {
    fail(res, 404, 'That does not look like a Nivora member pass.');
    return null;
  }
  const scope = societyFor(req);
  const pass = await EntryPass.findOne(scope ? { code, societyId: scope } : { code });
  const user = pass && (await User.findById(pass.userId));
  if (!pass || !user) {
    fail(res, 404, 'This pass is not valid. It may have been replaced by a newer one.');
    return null;
  }
  return { pass, user };
};

const codeCheck = [body('code').isString().trim().isLength({ min: 8, max: 40 }).withMessage('Enter or scan the pass code')];

// @route   POST /api/passes/lookup
// @desc    Who does this pass belong to, and are they in or out? Changes nothing.
router.post('/lookup', protect, authorize(...GATE_ROLES), guessLimiter, codeCheck, async (req, res) => {
  if (invalid(req, res)) return undefined;
  try {
    const found = await resolve(req, res);
    if (!found) return undefined;
    const person = await mp.present(found.user, await mp.lastEvent(found.user._id));
    return res.json({ success: true, person, next: person.inside ? 'out' : 'in' });
  } catch (error) {
    return serverError(res, error, 'Pass lookup');
  }
});

// @route   POST /api/passes/check
// @desc    Record the person coming in or going out. Without `direction` it flips from where they were.
//          Family members start at home (so the first scan is "going out"); guards, staff and admins start outside.
router.post('/check', protect, authorize(...GATE_ROLES), guessLimiter, [...codeCheck, body('direction').optional().isIn(['in', 'out']).withMessage('Direction must be in or out')], async (req, res) => {
  if (invalid(req, res)) return undefined;
  try {
    const found = await resolve(req, res);
    if (!found) return undefined;
    const { user } = found;
    if (user.isActive === false) return fail(res, 403, `${user.name}’s account is switched off. Do not let them in on this pass.`);
    const before = await mp.present(user, await mp.lastEvent(user._id));
    const action = req.body.direction || (before.inside ? 'out' : 'in');
    const at = new Date();
    await MemberLog.create({
      societyId: user.societyId,
      userId: user._id,
      householdHeadId: mp.livesInFlat(user) ? user.householdHeadId || user._id : undefined,
      name: user.name,
      role: user.role,
      relation: user.relation || '',
      flatNo: user.flatNo || '',
      block: user.block || '',
      action,
      at,
      scannedBy: req.user._id
    });

    // The head of the house hears about the rest of the family (not about their own scan).
    if (user.householdHeadId) {
      await safeNotifyMany(req.app.get('io'), [user.householdHeadId], {
        societyId: user.societyId,
        type: 'general',
        title: action === 'out' ? `${user.name} went out` : `${user.name} came home`,
        message: `${user.name} ${action === 'out' ? 'left through' : 'came in through'} the gate at ${at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}.`,
        actionUrl: '/household',
        priority: 'low'
      });
    }
    return res.json({
      success: true,
      action,
      at,
      message: `${user.name} ${mp.livesInFlat(user) ? (action === 'out' ? 'is going out' : 'is coming in') : (action === 'out' ? 'has left' : 'has entered')}.`,
      person: { ...before, inside: action === 'in', since: at }
    });
  } catch (error) {
    return serverError(res, error, 'Pass check');
  }
});

// @route   GET /api/passes/recent
// @desc    The latest member gate events for the society (guards and admins)
router.get('/recent', protect, authorize(...GATE_ROLES), [query('limit').optional().isInt({ min: 1, max: 100 })], async (req, res) => {
  if (invalid(req, res)) return undefined;
  try {
    const scope = societyFor(req);
    const { limit } = paging(req, { max: 100, fallback: 25 });
    const events = await MemberLog.find(scope ? { societyId: scope } : {}).sort({ at: -1 }).limit(limit).lean();
    return res.json({ success: true, events: events.map((e) => ({ ...e, flat: flatLabel(e) })) });
  } catch (error) {
    return serverError(res, error, 'Recent member events');
  }
});

module.exports = router;
