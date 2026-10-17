const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const FacilityTask = require('../models/FacilityTask');
const Society = require('../models/Society');
const User = require('../models/User');
const { protect, authorize, scopeToSociety } = require('../middleware/auth');
const { safeNotifyMany } = require('../utils/safeNotify');
const { DEFAULT_TZ, todayIn, addDays, isValidDate } = require('../utils/timezone');
const { fail, invalid, serverError, isAdminRole, societyFor } = require('../utils/routeKit');

router.param('id', scopeToSociety(FacilityTask));

const ADMINS = ['society_admin', 'super_admin'];
const DOERS = ['staff', 'security', ...ADMINS]; // may record that a job was done
const SOON_DAYS = 7;

const societyTz = async (societyId) => {
  const s = await Society.findById(societyId).select('timezone').lean();
  return (s && s.timezone) || DEFAULT_TZ;
};

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

const statusOf = (task, today) => {
  const left = daysBetween(today, task.nextDue);
  if (left < 0) return { status: 'overdue', daysLeft: left };
  if (left <= SOON_DAYS) return { status: 'due_soon', daysLeft: left };
  return { status: 'ok', daysLeft: left };
};

// Residents see what is maintained and when, but not who is paid or what it cost.
const present = (t, today, viewer) => {
  const office = DOERS.includes(viewer.role);
  const history = [...(t.history || [])].reverse().slice(0, 5).map((h) => ({ _id: h._id, doneOn: h.doneOn, byName: h.byName, note: h.note, ...(office ? { cost: h.cost } : {}) }));
  return {
    _id: t._id,
    name: t.name,
    category: t.category,
    location: t.location,
    intervalDays: t.intervalDays,
    nextDue: t.nextDue,
    lastDone: t.lastDone,
    active: t.active,
    notes: office ? t.notes : undefined,
    contractor: office ? t.contractor : undefined,
    contractorPhone: office ? t.contractorPhone : undefined,
    history,
    canComplete: office && t.active,
    canManage: isAdminRole(viewer),
    ...statusOf(t, today)
  };
};

const rules = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Say what needs to be maintained'),
  body('category').optional().isIn(FacilityTask.CATEGORIES).withMessage('Unknown category'),
  body('location').optional().isString().isLength({ max: 80 }),
  body('intervalDays').isInt({ min: 1, max: 1095 }).withMessage('Repeat every 1 to 1095 days'),
  body('nextDue').optional({ checkFalsy: true }).custom(isValidDate).withMessage('Pick a valid due date'),
  body('contractor').optional().isString().isLength({ max: 80 }),
  body('contractorPhone').optional({ checkFalsy: true }).matches(/^[0-9+\-() ]{3,20}$/).withMessage('Enter a valid phone number'),
  body('notes').optional().isString().isLength({ max: 300 }),
  body('active').optional().isBoolean()
];

// @route   GET /api/facility
// @desc    Upkeep schedule: what is overdue, what is due soon, what is fine.
router.get('/', protect, authorize('resident', ...DOERS), async (req, res) => {
  try {
    const societyId = societyFor(req);
    if (!societyId) return res.json({ success: true, tasks: [], counts: { overdue: 0, due_soon: 0, ok: 0 } });
    const today = todayIn(await societyTz(societyId));
    const filter = { societyId };
    if (!isAdminRole(req.user)) filter.active = true;
    const tasks = await FacilityTask.find(filter).sort({ nextDue: 1 }).limit(300).lean();
    const list = tasks.map((t) => present(t, today, req.user));
    const counts = { overdue: 0, due_soon: 0, ok: 0 };
    list.filter((t) => t.active).forEach((t) => {
      counts[t.status] += 1;
    });
    res.json({ success: true, today, tasks: list, counts });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'List facility tasks');
  }
});

// @route   POST /api/facility
router.post('/', protect, authorize(...ADMINS), rules, async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const societyId = societyFor(req);
    if (!societyId) return fail(res, 400, 'Choose a society first.');
    const today = todayIn(await societyTz(societyId));
    const { name, category, location, intervalDays, nextDue, contractor, contractorPhone, notes } = req.body;
    const days = Number(intervalDays);
    const task = await FacilityTask.create({ societyId, name, category, location, intervalDays: days, nextDue: nextDue || addDays(today, days), contractor, contractorPhone, notes, createdBy: req.user.id });
    res.status(201).json({ success: true, task: present(task, today, req.user), message: 'Added to the upkeep schedule' });
    return undefined;
  } catch (error) {
    if (error.name === 'ValidationError') return fail(res, 400, Object.values(error.errors)[0].message);
    return serverError(res, error, 'Create facility task');
  }
});

// @route   PUT /api/facility/:id
router.put('/:id', protect, authorize(...ADMINS), rules, async (req, res) => {
  try {
    if (invalid(req, res)) return undefined;
    const task = await FacilityTask.findById(req.params.id);
    if (!task) return fail(res, 404, 'Task not found');
    ['name', 'category', 'location', 'contractor', 'contractorPhone', 'notes', 'nextDue', 'active'].forEach((k) => {
      if (req.body[k] !== undefined && req.body[k] !== '') task[k] = req.body[k];
    });
    if (req.body.intervalDays !== undefined) task.intervalDays = Number(req.body.intervalDays);
    await task.save();
    const today = todayIn(await societyTz(task.societyId));
    res.json({ success: true, task: present(task, today, req.user), message: 'Saved' });
    return undefined;
  } catch (error) {
    if (error.name === 'ValidationError') return fail(res, 400, Object.values(error.errors)[0].message);
    return serverError(res, error, 'Update facility task');
  }
});

// @route   DELETE /api/facility/:id
router.delete('/:id', protect, authorize(...ADMINS), async (req, res) => {
  try {
    const task = await FacilityTask.findById(req.params.id).select('_id');
    if (!task) return fail(res, 404, 'Task not found');
    await FacilityTask.deleteOne({ _id: task._id });
    res.json({ success: true, message: 'Removed' });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'Delete facility task');
  }
});

// @route   POST /api/facility/:id/complete
// @desc    Record that the job was done. The next due date moves forward by the repeat interval.
router.post(
  '/:id/complete',
  protect,
  authorize(...DOERS),
  [
    body('doneOn').optional({ checkFalsy: true }).custom(isValidDate).withMessage('Pick a valid date'),
    body('note').optional().isString().isLength({ max: 300 }).withMessage('Keep the note under 300 characters'),
    body('cost').optional({ checkFalsy: true }).isFloat({ min: 0, max: 100000000 }).withMessage('Enter a valid cost')
  ],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      const task = await FacilityTask.findById(req.params.id);
      if (!task) return fail(res, 404, 'Task not found');
      if (!isAdminRole(req.user) && String(task.societyId) !== String(req.user.societyId)) return fail(res, 403, 'Not authorized');
      if (!task.active) return fail(res, 409, 'This task is switched off.');

      const today = todayIn(await societyTz(task.societyId));
      const doneOn = req.body.doneOn || today;
      if (doneOn > today) return fail(res, 400, 'The date cannot be in the future.');
      if (doneOn < addDays(today, -60)) return fail(res, 400, 'That date is too far back.');

      const entry = { doneOn, by: req.user.id, byName: req.user.name, note: req.body.note ? String(req.body.note).trim() : '' };
      // Costs are the office's business; staff and guards record the job, not the money.
      if (isAdminRole(req.user) && req.body.cost !== undefined && req.body.cost !== '') entry.cost = Number(req.body.cost);

      // Only if this is newer than the last record, so two people pressing "done" do not both push the date.
      const updated = await FacilityTask.findOneAndUpdate(
        { _id: task._id, active: true, $or: [{ lastDone: { $exists: false } }, { lastDone: { $lt: doneOn } }] },
        { $set: { lastDone: doneOn, nextDue: addDays(doneOn, task.intervalDays) }, $push: { history: { $each: [entry], $slice: -40 } } },
        { new: true }
      );
      if (!updated) return fail(res, 409, 'This was already recorded for that date or later.');

      if (!isAdminRole(req.user)) {
        // Telling the office is a courtesy: it must never turn a saved record into an error.
        try {
          const admins = await User.find({ societyId: task.societyId, role: 'society_admin', isActive: true }).select('_id').lean();
          await safeNotifyMany(req.app.get('io'), admins.map((a) => a._id), {
            societyId: task.societyId,
            type: 'facility',
            title: 'Upkeep done',
            message: `${req.user.name} recorded: ${task.name}.`,
            relatedId: task._id,
            relatedModel: 'FacilityTask',
            actionUrl: '/upkeep'
          });
        } catch (e) {
          console.error('Upkeep notice failed:', e.message);
        }
      }
      res.json({ success: true, task: present(updated, today, req.user), message: 'Recorded. Next due ' + updated.nextDue + '.' });
      return undefined;
    } catch (error) {
      return serverError(res, error, 'Complete facility task');
    }
  }
);

module.exports = router;
