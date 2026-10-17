const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const Expense = require('../models/Expense');
const Payment = require('../models/Payment');
const Society = require('../models/Society');
const mongoose = require('mongoose');
const { protect, authorize, scopeToSociety } = require('../middleware/auth');
const { DEFAULT_TZ, isValidDate, todayIn, zonedToUtc, addDays } = require('../utils/timezone');
const { fail, invalid, serverError, societyFor, isSafeUrl } = require('../utils/routeKit');

router.param('id', scopeToSociety(Expense));

const ADMINS = ['society_admin', 'super_admin'];
const monthOk = (m) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

const rules = [
  body('title').trim().isLength({ min: 2, max: 120 }).withMessage('Enter what the money was spent on'),
  body('amount').isFloat({ min: 1, max: 100000000 }).withMessage('Enter an amount of at least 1'),
  body('date').custom(isValidDate).withMessage('Pick a valid date'),
  body('category').optional().isIn(Expense.CATEGORIES).withMessage('Unknown category'),
  body('vendor').optional().isString().isLength({ max: 80 }),
  body('note').optional().isString().isLength({ max: 300 }),
  body('receipt').optional({ checkFalsy: true }).custom(isSafeUrl).withMessage('The receipt link is not valid')
];

const nextMonth = (m) => {
  const [y, mo] = m.split('-').map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
};

// @route   GET /api/expenses?month=YYYY-MM   (admins)
router.get('/', protect, authorize(...ADMINS), [query('month').optional().custom(monthOk).withMessage('Month must look like 2026-10')], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const societyId = societyFor(req);
    if (!societyId) return res.json({ success: true, expenses: [], total: 0 });
    const filter = { societyId };
    if (req.query.month) filter.date = { $gte: `${req.query.month}-01`, $lt: `${nextMonth(req.query.month)}-01` };
    const expenses = await Expense.find(filter).sort({ date: -1, createdAt: -1 }).limit(500).lean();
    res.json({ success: true, expenses, total: expenses.reduce((n, e) => n + e.amount, 0) });
  } catch (error) {
    serverError(res, error, 'List expenses');
  }
});

// @route   POST /api/expenses
router.post('/', protect, authorize(...ADMINS), rules, async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const societyId = societyFor(req);
    if (!societyId) return fail(res, 400, 'Choose a society first.');
    const { title, amount, date, category, vendor, note, receipt } = req.body;
    const expense = await Expense.create({ societyId, title, amount: Number(amount), date, category, vendor, note, receipt, createdBy: req.user.id });
    res.status(201).json({ success: true, expense, message: 'Expense recorded' });
  } catch (error) {
    if (error.name === 'ValidationError') return fail(res, 400, Object.values(error.errors)[0].message);
    return serverError(res, error, 'Create expense');
  }
});

// @route   PUT /api/expenses/:id
router.put('/:id', protect, authorize(...ADMINS), rules, async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const expense = await Expense.findById(req.params.id);
    if (!expense) return fail(res, 404, 'Expense not found');
    ['title', 'amount', 'date', 'category', 'vendor', 'note', 'receipt'].forEach((k) => {
      if (req.body[k] !== undefined) expense[k] = k === 'amount' ? Number(req.body[k]) : req.body[k];
    });
    await expense.save();
    res.json({ success: true, expense, message: 'Expense saved' });
  } catch (error) {
    if (error.name === 'ValidationError') return fail(res, 400, Object.values(error.errors)[0].message);
    return serverError(res, error, 'Update expense');
  }
});

// @route   DELETE /api/expenses/:id
router.delete('/:id', protect, authorize(...ADMINS), async (req, res) => {
  try {
    const expense = await Expense.findById(req.params.id);
    if (!expense) return fail(res, 404, 'Expense not found');
    await Expense.deleteOne({ _id: expense._id });
    res.json({ success: true, message: 'Expense deleted' });
  } catch (error) {
    serverError(res, error, 'Delete expense');
  }
});

// @route   GET /api/expenses/summary?month=YYYY-MM
// @desc    What the society collected and spent. Visible to residents too: totals and categories, not individual bills.
router.get('/summary', protect, authorize('resident', ...ADMINS), [query('month').optional().custom(monthOk).withMessage('Month must look like 2026-10')], async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const societyId = societyFor(req);
    if (!societyId) return fail(res, 400, 'Choose a society first.');

    const society = await Society.findById(societyId).select('timezone').lean();
    const tz = (society && society.timezone) || DEFAULT_TZ;
    const month = req.query.month || todayIn(tz).slice(0, 7);
    const from = `${month}-01`;
    const to = `${nextMonth(month)}-01`;
    const fromAt = zonedToUtc(from, '00:00', tz);
    const toAt = zonedToUtc(to, '00:00', tz);
    const sid = new mongoose.Types.ObjectId(String(societyId));

    const [spentByCategory, collected, dues] = await Promise.all([
      Expense.aggregate([{ $match: { societyId: sid, date: { $gte: from, $lt: to } } }, { $group: { _id: '$category', amount: { $sum: '$amount' }, count: { $sum: 1 } } }, { $sort: { amount: -1 } }]),
      Payment.aggregate([{ $match: { societyId: sid, status: 'completed', paidAt: { $gte: fromAt, $lt: toAt } } }, { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      Payment.aggregate([{ $match: { societyId: sid, status: 'pending' } }, { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } }])
    ]);

    const spent = spentByCategory.reduce((n, c) => n + c.amount, 0);
    const collectedAmount = collected[0] ? collected[0].amount : 0;
    res.json({
      success: true,
      month,
      collected: collectedAmount,
      spent,
      balance: collectedAmount - spent,
      pendingDues: dues[0] ? dues[0].amount : 0,
      pendingCount: dues[0] ? dues[0].count : 0,
      byCategory: spentByCategory.map((c) => ({ category: c._id, amount: c.amount, count: c.count }))
    });
  } catch (error) {
    serverError(res, error, 'Expense summary');
  }
});

module.exports = router;
