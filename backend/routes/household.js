const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { body, query } = require('express-validator');
const User = require('../models/User');
const Society = require('../models/Society');
const MemberLog = require('../models/MemberLog');
const Visitor = require('../models/Visitor');
const DailyHelp = require('../models/DailyHelp');
const HelpAttendance = require('../models/HelpAttendance');
const { protect, authorize } = require('../middleware/auth');
const { fail, invalid, serverError, isSafeUrl, flatLabel } = require('../utils/routeKit');
const { inviteResult } = require('../utils/invite');
const mp = require('../utils/memberPass');

const router = express.Router();

// A home's family accounts. The head of the house (the resident who owns the flat's account) adds family members,
// gives them a photo and a login, and each gets a permanent entry pass. Members live in the same flat.
// Anyone in the home can see who is in the home; only the head can add, change or switch off members, and see the flat's gate activity.

const MAX_MEMBERS = 10;
const NO_LOGIN = '@members.invalid'; // a placeholder email for members who only need a pass (children, grandparents without email)

const hasLogin = (u) => !String(u.email || '').endsWith(NO_LOGIN);
const isHead = (u) => u.role === 'resident' && !u.householdHeadId;

const headOf = async (user) => (user.householdHeadId ? User.findById(user.householdHeadId) : user);

// Latest gate event per person from a batch of events (newest first).
const latestBy = (events) => {
  const map = new Map();
  events.forEach((e) => {
    if (!map.has(String(e.userId))) map.set(String(e.userId), e);
  });
  return map;
};

const personRow = (u, last) => {
  const p = mp.presenceOf(u, last);
  return {
    _id: u._id,
    name: u.name,
    relation: u.relation || (isHead(u) ? 'Head of the house' : ''),
    phone: u.phone,
    email: hasLogin(u) ? u.email : '',
    hasLogin: hasLogin(u),
    photo: u.profilePic || '',
    isHead: isHead(u),
    isActive: u.isActive !== false,
    inside: p.inside,
    since: p.since,
    known: p.known
  };
};

const family = async (head) => {
  const members = await User.find({ societyId: head.societyId, householdHeadId: head._id }).sort({ createdAt: 1 });
  const ids = [head._id, ...members.map((m) => m._id)];
  const events = await MemberLog.find({ userId: { $in: ids } }).sort({ at: -1 }).limit(300).lean();
  const last = latestBy(events);
  return { head, members, rows: [head, ...members].map((u) => personRow(u, last.get(String(u._id)))) };
};

const guardResident = (req, res) => {
  if (req.user.role !== 'resident') {
    fail(res, 403, 'Only residents have a household.');
    return false;
  }
  return true;
};

const needHead = (req, res) => {
  if (!isHead(req.user)) {
    fail(res, 403, 'Only the head of the house can do this.');
    return false;
  }
  return true;
};

// The family member a request is about. Sends the error and returns null when it is not one of this head's members.
const memberFor = async (req, res) => {
  const { id } = req.params;
  const member = mongoose.Types.ObjectId.isValid(id) ? await User.findById(id) : null;
  if (!member || String(member.householdHeadId) !== String(req.user._id)) {
    fail(res, 404, 'Family member not found');
    return null;
  }
  return member;
};

const photoCheck = body('profilePic').optional({ checkFalsy: true }).custom((v) => isSafeUrl(v)).withMessage('Upload the photo again');

// @route   GET /api/household
// @desc    The home: head of the house and family members, with who is in or out right now
router.get('/', protect, authorize('resident'), async (req, res) => {
  try {
    const head = await headOf(req.user);
    if (!head) return fail(res, 404, 'Household not found');
    const { rows } = await family(head);
    return res.json({ success: true, flat: flatLabel(head), canManage: isHead(req.user), maxMembers: MAX_MEMBERS, members: rows });
  } catch (error) {
    return serverError(res, error, 'Household');
  }
});

// @route   POST /api/household/members
// @desc    Add a family member: a login (when an email is given), a photo and a permanent pass
router.post('/members', protect, authorize('resident'), [
  body('name').trim().isLength({ min: 2, max: 60 }).withMessage('Enter the person’s name'),
  body('phone').matches(/^[0-9]{10}$/).withMessage('Enter a valid 10-digit phone number'),
  body('relation').trim().isLength({ min: 2, max: 30 }).withMessage('Say how they are related (wife, son, mother ...)'),
  body('email').optional({ checkFalsy: true }).trim().isEmail().withMessage('Enter a valid email address').normalizeEmail({ gmail_remove_dots: false }),
  photoCheck
], async (req, res) => {
  if (invalid(req, res)) return undefined;
  if (!needHead(req, res)) return undefined;
  try {
    const head = req.user;
    const existing = await User.countDocuments({ societyId: head.societyId, householdHeadId: head._id });
    if (existing >= MAX_MEMBERS) return fail(res, 400, `You can add up to ${MAX_MEMBERS} family members.`);

    const { name, phone, relation, profilePic } = req.body;
    const email = req.body.email || `pass-only-${crypto.randomBytes(8).toString('hex')}${NO_LOGIN}`;
    if (req.body.email && (await User.findOne({ email }))) return fail(res, 409, 'Someone already has an account with this email.');

    let member;
    try {
      member = await User.create({
        name,
        email,
        phone,
        relation,
        profilePic: profilePic || '',
        role: 'resident',
        societyId: head.societyId,
        flatNo: head.flatNo,
        block: head.block,
        householdHeadId: head._id,
        password: `${crypto.randomBytes(18).toString('base64url')}a1`, // never shown; they choose their own through the link
        isApproved: true,
        approvedBy: head._id,
        approvedAt: new Date(),
        emailVerified: true,
        phoneVerified: true
      });
    } catch (e) {
      if (e.code === 11000) return fail(res, 409, 'Someone already has an account with this email.');
      throw e;
    }
    await mp.ensurePass(member);

    let invite = null;
    if (hasLogin(member)) {
      const society = await Society.findById(head.societyId).select('name');
      invite = await inviteResult(head, member, society);
    }
    const note = invite
      ? (invite.emailSent ? `${name} was added and emailed a link to choose a password.` : `${name} was added. The email could not be sent, so share the setup link yourself.`)
      : `${name} was added with an entry pass.`;
    return res.status(201).json({ success: true, message: note, invite, member: personRow(member, null) });
  } catch (error) {
    return serverError(res, error, 'Add family member');
  }
});

// @route   PUT /api/household/members/:id
// @desc    Change a member's name, phone, relation or photo
router.put('/members/:id', protect, authorize('resident'), [
  body('name').optional().trim().isLength({ min: 2, max: 60 }).withMessage('Enter the person’s name'),
  body('phone').optional().matches(/^[0-9]{10}$/).withMessage('Enter a valid 10-digit phone number'),
  body('relation').optional().trim().isLength({ min: 2, max: 30 }).withMessage('Say how they are related'),
  photoCheck
], async (req, res) => {
  if (invalid(req, res)) return undefined;
  if (!needHead(req, res)) return undefined;
  try {
    const member = await memberFor(req, res);
    if (!member) return undefined;
    ['name', 'phone', 'relation'].forEach((k) => {
      if (req.body[k] !== undefined) member[k] = req.body[k];
    });
    if (req.body.profilePic !== undefined) member.profilePic = req.body.profilePic || '';
    await member.save({ validateBeforeSave: false });
    return res.json({ success: true, message: 'Saved', member: personRow(member, await mp.lastEvent(member._id)) });
  } catch (error) {
    return serverError(res, error, 'Update family member');
  }
});

// @route   PUT /api/household/members/:id/active
// @desc    Switch a member off (login and pass stop working; history is kept) or back on
router.put('/members/:id/active', protect, authorize('resident'), [body('active').isBoolean().withMessage('Say whether the member is active')], async (req, res) => {
  if (invalid(req, res)) return undefined;
  if (!needHead(req, res)) return undefined;
  try {
    const member = await memberFor(req, res);
    if (!member) return undefined;
    member.isActive = req.body.active === true || req.body.active === 'true';
    await member.save({ validateBeforeSave: false });
    return res.json({ success: true, message: member.isActive ? `${member.name} is active again.` : `${member.name} was switched off. Their pass no longer works.` });
  } catch (error) {
    return serverError(res, error, 'Switch family member');
  }
});

// @route   POST /api/household/members/:id/invite
// @desc    Send the sign-in link again
router.post('/members/:id/invite', protect, authorize('resident'), async (req, res) => {
  if (!needHead(req, res)) return undefined;
  try {
    const member = await memberFor(req, res);
    if (!member) return undefined;
    if (!hasLogin(member)) return fail(res, 400, 'This member has no email, so there is no login to invite. Add an email first.');
    const society = await Society.findById(member.societyId).select('name');
    const invite = await inviteResult(req.user, member, society);
    return res.json({ success: true, invite, message: invite.emailSent ? `A new link was emailed to ${member.name}.` : 'The email could not be sent, so share the setup link yourself.' });
  } catch (error) {
    return serverError(res, error, 'Invite family member');
  }
});

// @route   GET /api/household/activity?days=7
// @desc    Every entry and exit for this flat: family, visitors and daily help. For the head of the house.
router.get('/activity', protect, authorize('resident'), [query('days').optional().isInt({ min: 1, max: 30 }).withMessage('Days must be 1 to 30')], async (req, res) => {
  if (invalid(req, res)) return undefined;
  if (!guardResident(req, res) || !needHead(req, res)) return undefined;
  try {
    const head = req.user;
    const days = parseInt(req.query.days, 10) || 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const { members } = await family(head);
    const ids = [head._id, ...members.map((m) => m._id)];

    const flat = { societyId: head.societyId, flatNo: head.flatNo };
    if (head.block) flat.block = head.block;
    const [logs, visitors, helpers] = await Promise.all([
      MemberLog.find({ userId: { $in: ids }, at: { $gte: since } }).sort({ at: -1 }).limit(300).lean(),
      Visitor.find({ ...flat, entryTime: { $gte: since } }).sort({ entryTime: -1 }).limit(200).lean(),
      DailyHelp.find({ societyId: head.societyId, 'residents.userId': { $in: ids } }).select('name kind photo').lean()
    ]);
    const attendance = helpers.length
      ? await HelpAttendance.find({ helpId: { $in: helpers.map((x) => x._id) }, checkIn: { $gte: since } }).sort({ checkIn: -1 }).limit(200).lean()
      : [];
    const helperById = new Map(helpers.map((x) => [String(x._id), x]));

    const items = [];
    logs.forEach((e) => items.push({ id: `m${e._id}`, kind: 'family', name: e.name, detail: e.relation || (e.userId && String(e.userId) === String(head._id) ? 'Head of the house' : ''), action: e.action, at: e.at }));
    visitors.forEach((v) => {
      const detail = v.purpose || '';
      if (v.entryTime) items.push({ id: `v${v._id}in`, kind: 'visitor', name: v.name, detail, action: 'in', at: v.entryTime });
      if (v.exitTime) items.push({ id: `v${v._id}out`, kind: 'visitor', name: v.name, detail, action: 'out', at: v.exitTime });
    });
    attendance.forEach((a) => {
      const help = helperById.get(String(a.helpId));
      if (!help) return;
      items.push({ id: `h${a._id}in`, kind: 'helper', name: help.name, detail: help.kind || '', action: 'in', at: a.checkIn });
      if (a.checkOut) items.push({ id: `h${a._id}out`, kind: 'helper', name: help.name, detail: help.kind || '', action: 'out', at: a.checkOut });
    });
    items.sort((a, b) => new Date(b.at) - new Date(a.at));
    return res.json({ success: true, days, items: items.slice(0, 300) });
  } catch (error) {
    return serverError(res, error, 'Household activity');
  }
});

module.exports = router;
