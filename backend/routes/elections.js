const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { body } = require('express-validator');
const Election = require('../models/Election');
const Ballot = require('../models/Ballot');
const VoteLog = require('../models/VoteLog');
const User = require('../models/User');
const { protect, authorize, scopeToSociety } = require('../middleware/auth');
const { safeNotifyMany } = require('../utils/safeNotify');
const { fail, invalid, serverError, isAdminRole, societyFor, flatLabel } = require('../utils/routeKit');

router.param('id', scopeToSociety(Election));

const ADMINS = ['society_admin', 'super_admin'];
const isDuplicateKey = (e) => e && (e.code === 11000 || /E11000/.test(e.message || ''));

// Who is voting, as a one-way hash. The ballot row never holds a user id, so results cannot be traced to a person.
const voterKeyFor = (election, user) => {
  const who = election.voting === 'per_flat' ? `flat:${String(user.block || '').trim().toLowerCase()}-${String(user.flatNo || '').trim().toLowerCase()}` : `user:${user._id || user.id}`;
  return crypto.createHash('sha256').update(`${election._id}|${who}|${process.env.JWT_SECRET}`).digest('hex');
};

const eligibleCount = async (election) => {
  const people = await User.find({ societyId: election.societyId, role: 'resident', isApproved: true, isActive: true }).select('block flatNo').lean();
  if (election.voting === 'per_resident') return people.length;
  return new Set(people.filter((p) => p.flatNo).map((p) => `${p.block || ''}-${p.flatNo}`.toLowerCase())).size;
};

const tally = async (election) => {
  const rows = await Ballot.aggregate([{ $match: { electionId: election._id } }, { $group: { _id: '$optionId', votes: { $sum: 1 } } }]);
  const byOption = new Map(rows.map((r) => [String(r._id), r.votes]));
  const total = rows.reduce((n, r) => n + r.votes, 0);
  return { total, byOption };
};

const present = (election, { phase, voted, admin, total, counts, eligible } = {}) => {
  const out = {
    _id: election._id,
    title: election.title,
    description: election.description,
    kind: election.kind,
    voting: election.voting,
    opensAt: election.opensAt,
    closesAt: election.closesAt,
    phase,
    voted: !!voted,
    options: election.options.map((o) => ({ _id: o._id, label: o.label, detail: o.detail }))
  };
  if (total !== undefined) out.turnout = { votes: total, eligible };
  // Results stay hidden until voting ends, so early totals cannot sway the rest.
  if (counts && phase === 'closed') {
    const max = Math.max(0, ...out.options.map((o) => counts.get(String(o._id)) || 0));
    out.options = out.options.map((o) => ({ ...o, votes: counts.get(String(o._id)) || 0, percent: total ? Math.round(((counts.get(String(o._id)) || 0) / total) * 100) : 0, leading: max > 0 && (counts.get(String(o._id)) || 0) === max }));
    out.resultsVisible = true;
    out.tied = max > 0 && out.options.filter((o) => o.leading).length > 1;
  }
  if (admin) out.canManage = true;
  return out;
};

const rules = [
  body('title').trim().isLength({ min: 3, max: 120 }).withMessage('Give the vote a title'),
  body('description').optional().isString().isLength({ max: 1500 }).withMessage('Keep the description under 1500 characters'),
  body('kind').optional().isIn(['election', 'resolution']).withMessage('Kind must be election or resolution'),
  body('voting').optional().isIn(['per_flat', 'per_resident']).withMessage('Voting must be per_flat or per_resident'),
  body('opensAt').isISO8601().withMessage('Pick when voting opens'),
  body('closesAt').isISO8601().withMessage('Pick when voting closes'),
  body('options').isArray({ min: 2, max: 12 }).withMessage('Give between 2 and 12 options'),
  body('options.*.label').trim().isLength({ min: 1, max: 80 }).withMessage('Every option needs a name'),
  body('options.*.detail').optional().isString().isLength({ max: 300 })
];

const timesProblem = (opensAt, closesAt, { allowPast = false } = {}) => {
  const o = new Date(opensAt);
  const c = new Date(closesAt);
  if (!(c > o)) return 'Voting must close after it opens.';
  if (!allowPast && c <= new Date()) return 'The closing time is already past.';
  if (c - o > 90 * 24 * 3600 * 1000) return 'Voting can stay open for at most 90 days.';
  return null;
};

const cleanOptions = (options) => options.map((o) => ({ label: String(o.label).trim(), detail: o.detail ? String(o.detail).trim() : '' }));
const hasDuplicates = (options) => new Set(options.map((o) => o.label.toLowerCase())).size !== options.length;

// @route   GET /api/elections
// @desc    Votes in this society: open first, then upcoming, then closed.
router.get('/', protect, authorize('resident', ...ADMINS), async (req, res) => {
  try {
    const societyId = societyFor(req);
    if (!societyId) return res.json({ success: true, elections: [] });
    const elections = await Election.find({ societyId }).sort({ closesAt: -1 }).limit(100);
    const admin = isAdminRole(req.user);
    let mine = new Set();
    if (req.user.role === 'resident' && elections.length) {
      const keys = elections.map((e) => voterKeyFor(e, req.user));
      const ballots = await Ballot.find({ electionId: { $in: elections.map((e) => e._id) }, voterKey: { $in: keys } }).select('electionId').lean();
      mine = new Set(ballots.map((b) => String(b.electionId)));
    }
    const order = { open: 0, upcoming: 1, closed: 2, cancelled: 3 };
    const list = elections.map((e) => present(e, { phase: e.phase(), voted: mine.has(String(e._id)), admin })).sort((a, b) => order[a.phase] - order[b.phase]);
    res.json({ success: true, elections: list });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'List elections');
  }
});

// @route   GET /api/elections/:id
router.get('/:id', protect, authorize('resident', ...ADMINS), async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return fail(res, 404, 'Vote not found');
    const admin = isAdminRole(req.user);
    if (!admin && String(election.societyId) !== String(req.user.societyId)) return fail(res, 403, 'Not authorized');
    const phase = election.phase();
    const [{ total, byOption }, eligible] = await Promise.all([tally(election), eligibleCount(election)]);
    let voted = false;
    if (req.user.role === 'resident') voted = !!(await Ballot.findOne({ electionId: election._id, voterKey: voterKeyFor(election, req.user) }).select('_id').lean());
    // Residents see turnout only once it is over; the office can follow turnout while it runs.
    const showTurnout = admin || phase === 'closed';
    res.json({ success: true, election: present(election, { phase, voted, admin, total: showTurnout ? total : undefined, counts: byOption, eligible: showTurnout ? eligible : undefined }) });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'Get election');
  }
});

// @route   GET /api/elections/:id/voters
// @desc    Office only: who has voted and who has not. Never says what anyone chose.
router.get('/:id/voters', protect, authorize(...ADMINS), async (req, res) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return fail(res, 404, 'Vote not found');
    const [logs, ballots, people] = await Promise.all([
      VoteLog.find({ electionId: election._id }).sort({ votedAt: 1 }).lean(),
      Ballot.countDocuments({ electionId: election._id }),
      User.find({ societyId: election.societyId, role: 'resident', isApproved: true, isActive: true }).select('name block flatNo').lean()
    ]);
    const voted = logs.map((l) => ({ name: l.name || 'Resident', flat: l.flat || '', votedAt: l.votedAt }));
    const votedKeys = new Set(logs.map((l) => l.voterKey));
    const waiting = [];
    if (election.voting === 'per_resident') {
      people.forEach((p) => { if (!votedKeys.has(voterKeyFor(election, p))) waiting.push({ name: p.name, flat: flatLabel(p) }); });
    } else {
      const flats = new Map();
      people.filter((p) => p.flatNo).forEach((p) => {
        const key = voterKeyFor(election, p);
        if (votedKeys.has(key)) return;
        const row = flats.get(key) || { name: [], flat: flatLabel(p) };
        row.name.push(p.name);
        flats.set(key, row);
      });
      flats.forEach((r) => waiting.push({ name: r.name.join(', '), flat: r.flat }));
    }
    res.json({ success: true, voting: election.voting, voted, waiting, votes: ballots, unlisted: Math.max(0, ballots - voted.length) });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'Voter list');
  }
});

// @route   POST /api/elections
router.post('/', protect, authorize(...ADMINS), rules, async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const societyId = societyFor(req);
    if (!societyId) return fail(res, 400, 'Choose a society first.');
    const problem = timesProblem(req.body.opensAt, req.body.closesAt);
    if (problem) return fail(res, 400, problem);
    const options = cleanOptions(req.body.options);
    if (hasDuplicates(options)) return fail(res, 400, 'Each option needs a different name.');
    const { title, description, kind, voting, opensAt, closesAt } = req.body;
    const election = await Election.create({ societyId, title, description, kind, voting, opensAt, closesAt, options, createdBy: req.user.id });

    try {
      const people = await User.find({ societyId, role: 'resident', isApproved: true, isActive: true }).select('_id').lean();
      await safeNotifyMany(req.app.get('io'), people.map((p) => p._id), {
        societyId,
        type: 'election',
        title: election.kind === 'election' ? 'New election' : 'New vote',
        message: `${election.title}: voting opens ${new Date(election.opensAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}.`,
        relatedId: election._id,
        relatedModel: 'Election',
        actionUrl: '/votes'
      });
    } catch (e) {
      console.error('Vote notice failed:', e.message); // the vote is saved; telling people is best effort
    }
    res.status(201).json({ success: true, election: present(election, { phase: election.phase(), admin: true }), message: 'Vote created' });
    return undefined;
  } catch (error) {
    if (error.name === 'ValidationError') return fail(res, 400, Object.values(error.errors)[0].message);
    return serverError(res, error, 'Create election');
  }
});

// @route   PUT /api/elections/:id
// @desc    Edit a vote that has not opened yet. After that the question is fixed so nobody votes on one thing and is counted on another.
router.put('/:id', protect, authorize(...ADMINS), rules, async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const election = await Election.findById(req.params.id);
    if (!election) return fail(res, 404, 'Vote not found');
    if (election.phase() !== 'upcoming') return fail(res, 409, 'Voting has already opened, so this vote can no longer be changed. You can cancel it and start a new one.');
    const problem = timesProblem(req.body.opensAt, req.body.closesAt);
    if (problem) return fail(res, 400, problem);
    const options = cleanOptions(req.body.options);
    if (hasDuplicates(options)) return fail(res, 400, 'Each option needs a different name.');
    ['title', 'description', 'kind', 'voting', 'opensAt', 'closesAt'].forEach((k) => {
      if (req.body[k] !== undefined) election[k] = req.body[k];
    });
    election.options = options;
    await election.save();
    res.json({ success: true, election: present(election, { phase: election.phase(), admin: true }), message: 'Vote saved' });
    return undefined;
  } catch (error) {
    if (error.name === 'ValidationError') return fail(res, 400, Object.values(error.errors)[0].message);
    return serverError(res, error, 'Update election');
  }
});

// @route   PUT /api/elections/:id/cancel
router.put('/:id/cancel', protect, authorize(...ADMINS), async (req, res) => {
  try {
    const now = new Date();
    const done = await Election.findOneAndUpdate({ _id: req.params.id, cancelled: { $ne: true }, closesAt: { $gt: now } }, { $set: { cancelled: true } }, { new: true });
    if (!done) return fail(res, 409, 'This vote is already closed or cancelled.');
    res.json({ success: true, message: 'Vote cancelled' });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'Cancel election');
  }
});

// @route   POST /api/elections/:id/vote
// @desc    Cast a vote. One per flat (or per resident). A vote cannot be changed or withdrawn.
router.post('/:id/vote', protect, authorize('resident'), [body('optionId').isMongoId().withMessage('Pick one of the options')], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const election = await Election.findById(req.params.id);
    if (!election) return fail(res, 404, 'Vote not found');
    if (String(election.societyId) !== String(req.user.societyId)) return fail(res, 403, 'Not authorized');
    const phase = election.phase();
    if (phase !== 'open') return fail(res, 409, phase === 'upcoming' ? 'Voting has not opened yet.' : phase === 'cancelled' ? 'This vote was cancelled.' : 'Voting has closed.');
    if (election.voting === 'per_flat' && !req.user.flatNo) return fail(res, 403, 'Your account has no flat number, so it cannot vote. Ask the office to add it.');
    const option = election.options.find((o) => String(o._id) === String(req.body.optionId));
    if (!option) return fail(res, 400, 'That is not one of the options.');

    try {
      await Ballot.create({ electionId: election._id, societyId: election.societyId, voterKey: voterKeyFor(election, req.user), optionId: option._id });
    } catch (e) {
      if (isDuplicateKey(e)) return fail(res, 409, election.voting === 'per_flat' ? 'Your flat has already voted.' : 'You have already voted.');
      throw e;
    }
    // Turnout record for the office: who took part, never what they chose. A failure here must not undo the vote.
    try {
      await VoteLog.create({ electionId: election._id, societyId: election.societyId, voterKey: voterKeyFor(election, req.user), userId: req.user._id || req.user.id, name: req.user.name, flat: flatLabel(req.user) });
    } catch (e) {
      if (!isDuplicateKey(e)) console.error('Vote log failed:', e.message);
    }
    res.status(201).json({ success: true, message: 'Your vote is recorded. Thank you!' });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'Cast vote');
  }
});

module.exports = router;
