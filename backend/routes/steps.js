const express = require('express');
const { body, query } = require('express-validator');
const StepDay = require('../models/StepDay');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { fail, invalid, serverError } = require('../utils/routeKit');
const { societyTz } = require('../utils/dailyHelpCodes');
const { todayIn, addDays } = require('../utils/timezone');

const router = express.Router();

// The walking challenge. The app counts steps from the phone's motion sensor while it is open and saves the day's total here.
// A future Android companion app can send the same totals (source: "android") so steps count even when Nivora is closed.

const DAILY_GOAL = 8000;
const MAX_STEPS_PER_DAY = 100000; // more than anyone walks: stops a typo or a cheat from topping the board
const WEEK = 7;

const needSociety = (req, res) => {
  if (!req.user.societyId) {
    fail(res, 400, 'The walking challenge is for people who belong to a society.');
    return false;
  }
  return true;
};

// Consecutive days that reached the goal, counting back from today (or from yesterday while today is still short of it).
const streakOf = (byDate, today) => {
  let day = byDate.get(today) >= DAILY_GOAL ? today : addDays(today, -1);
  let n = 0;
  while (byDate.get(day) >= DAILY_GOAL) {
    n += 1;
    day = addDays(day, -1);
  }
  return n;
};

// @route   POST /api/steps
// @desc    Save today's total. It only ever goes up, so syncing twice or from two devices never loses steps.
router.post('/', protect, [
  body('steps').isInt({ min: 0, max: MAX_STEPS_PER_DAY }).withMessage(`Steps must be between 0 and ${MAX_STEPS_PER_DAY}`).toInt(),
  body('date').optional({ checkFalsy: true }).matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date must look like 2026-10-28'),
  body('source').optional().isIn(['web', 'android']).withMessage('Unknown source')
], async (req, res) => {
  if (invalid(req, res) || !needSociety(req, res)) return undefined;
  try {
    const tz = await societyTz(req.user.societyId);
    const today = todayIn(tz);
    const date = req.body.date || today;
    // Today or the last two days (a phone that was offline can catch up). Never the future.
    if (date > today || date < addDays(today, -2)) return fail(res, 400, 'Steps can only be saved for today or the last two days.');

    const existing = await StepDay.findOne({ userId: req.user._id, date });
    const steps = Math.max(req.body.steps, existing ? existing.steps : 0);
    const row = await StepDay.findOneAndUpdate(
      { userId: req.user._id, date },
      { $set: { steps, societyId: req.user.societyId, source: req.body.source || 'web' } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.json({ success: true, date, steps: row ? row.steps : steps, goal: DAILY_GOAL, reachedGoal: steps >= DAILY_GOAL });
  } catch (error) {
    return serverError(res, error, 'Save steps');
  }
});

// @route   GET /api/steps/me
// @desc    Today, the last 7 days and the streak
router.get('/me', protect, async (req, res) => {
  if (!needSociety(req, res)) return undefined;
  try {
    const tz = await societyTz(req.user.societyId);
    const today = todayIn(tz);
    const from = addDays(today, -29);
    const rows = await StepDay.find({ userId: req.user._id, date: { $gte: from } }).lean();
    const byDate = new Map(rows.map((r) => [r.date, r.steps]));
    const week = Array.from({ length: WEEK }, (_, i) => {
      const date = addDays(today, i - (WEEK - 1));
      return { date, steps: byDate.get(date) || 0 };
    });
    return res.json({
      success: true,
      today,
      goal: DAILY_GOAL,
      steps: byDate.get(today) || 0,
      week,
      weekTotal: week.reduce((n, d) => n + d.steps, 0),
      streak: streakOf(byDate, today),
      onLeaderboard: req.user.stepsOnLeaderboard !== false
    });
  } catch (error) {
    return serverError(res, error, 'My steps');
  }
});

// @route   PUT /api/steps/settings
// @desc    Show or hide my name on the leaderboard
router.put('/settings', protect, [body('leaderboard').isBoolean().withMessage('Choose on or off')], async (req, res) => {
  if (invalid(req, res) || !needSociety(req, res)) return undefined;
  try {
    req.user.stepsOnLeaderboard = req.body.leaderboard === true || req.body.leaderboard === 'true';
    await req.user.save({ validateBeforeSave: false });
    return res.json({ success: true, onLeaderboard: req.user.stepsOnLeaderboard });
  } catch (error) {
    return serverError(res, error, 'Step settings');
  }
});

// @route   GET /api/steps/leaderboard?period=today|week
// @desc    Who in the society walked the most. Only people who left themselves on the board appear, with first name and flat.
router.get('/leaderboard', protect, [query('period').optional().isIn(['today', 'week']).withMessage('Period must be today or week')], async (req, res) => {
  if (invalid(req, res) || !needSociety(req, res)) return undefined;
  try {
    const period = req.query.period || 'today';
    const tz = await societyTz(req.user.societyId);
    const today = todayIn(tz);
    const from = period === 'today' ? today : addDays(today, -(WEEK - 1));
    const rows = await StepDay.find({ societyId: req.user.societyId, date: { $gte: from, $lte: today } }).lean();
    const totals = new Map();
    rows.forEach((r) => totals.set(String(r.userId), (totals.get(String(r.userId)) || 0) + r.steps));

    const ids = [...totals.keys()];
    const people = ids.length ? await User.find({ _id: { $in: ids }, societyId: req.user.societyId, isActive: true }).select('name flatNo block stepsOnLeaderboard profilePic').lean() : [];
    const board = people
      .filter((p) => p.stepsOnLeaderboard !== false || String(p._id) === String(req.user._id))
      .map((p) => ({
        userId: String(p._id),
        name: String(p.name || '').split(' ')[0],
        flat: p.flatNo ? `${p.block ? `${p.block}-` : ''}${p.flatNo}` : '',
        photo: p.profilePic || '',
        steps: totals.get(String(p._id)) || 0
      }))
      .sort((a, b) => b.steps - a.steps);
    const ranked = board.map((b, i) => ({ ...b, rank: i + 1, you: b.userId === String(req.user._id) }));
    return res.json({ success: true, period, goal: DAILY_GOAL * (period === 'week' ? WEEK : 1), top: ranked.slice(0, 20), you: ranked.find((r) => r.you) || null, walkers: ranked.length });
  } catch (error) {
    return serverError(res, error, 'Steps leaderboard');
  }
});

module.exports = router;
