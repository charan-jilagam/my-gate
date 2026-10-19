// Who is on duty right now. Used by the resident "who is on duty" card and by the emergency numbers,
// so the security desk number always belongs to a guard who is really there.

const Shift = require('../models/Shift');
const User = require('../models/User');

const GUARD_ROLES = ['security', 'guard_admin'];
const DUTY_ROLES = ['security', 'guard_admin', 'staff'];
const OFFICE_ROLES = ['society_admin', 'super_admin', 'guard_admin'];

const toPerson = (s, now) => {
  const u = s.userId || {};
  return {
    userId: String((u && u._id) || s.userId),
    name: u.name,
    role: u.role,
    phone: u.phone,
    post: s.post,
    postName: s.postName || undefined,
    startTime: s.startTime,
    endTime: s.endTime,
    startAt: s.startAt,
    endAt: s.endAt,
    checkedIn: !!s.clockInAt,
    since: s.clockInAt || undefined
  };
};

// Guards whose shift covers this moment and who have not clocked out. Guards (not housekeeping staff) only.
const onDutyNow = async (societyId, now = new Date()) => {
  if (!societyId) return [];
  const shifts = await Shift.find({ societyId, startAt: { $lte: now }, endAt: { $gte: now }, clockOutAt: { $exists: false } }).populate('userId', 'name phone role');
  return (shifts || [])
    .filter((s) => s.userId && GUARD_ROLES.includes(s.userId.role))
    .map((s) => toPerson(s, now))
    .sort((a, b) => Number(b.checkedIn) - Number(a.checkedIn) || Number(b.post === 'main_gate') - Number(a.post === 'main_gate') || String(a.name).localeCompare(String(b.name)));
};

// The one number a resident should call first: a guard who has clocked in, preferably at the main gate.
// If nobody has clocked in yet, the guard who is meant to be on duty. Null when nobody is rostered.
const pickDesk = (list) => (list && list.length ? list[0] : null);

// The head of the guards, for residents who need a second number.
const guardHead = async (societyId) => {
  if (!societyId) return null;
  const heads = await User.find({ societyId, role: 'guard_admin', isActive: true, isApproved: true }).select('name phone').sort({ name: 1 }).limit(1);
  const head = heads && heads[0];
  return head ? { name: head.name, phone: head.phone } : null;
};

// Ids to notify.
const idsWithRoles = async (societyId, roles) => {
  if (!societyId) return [];
  const users = await User.find({ societyId, role: { $in: roles }, isActive: true, isApproved: true }).select('_id');
  return (users || []).map((u) => String(u._id));
};

module.exports = { GUARD_ROLES, DUTY_ROLES, OFFICE_ROLES, onDutyNow, pickDesk, guardHead, idsWithRoles };
