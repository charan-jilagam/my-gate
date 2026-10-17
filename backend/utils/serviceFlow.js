// Life cycle of a service request, and who may move it forward.
//
//   requested -> confirmed -> on_the_way -> in_progress -> completed
//        |            |            |
//        +-> declined +-> cancelled (any time before the work starts)
//
// Kept free of database code so the rules can be tested on their own.

const crypto = require('crypto');

const STATUSES = ['requested', 'confirmed', 'on_the_way', 'in_progress', 'completed', 'cancelled', 'declined'];

// A request in one of these states holds its time slot.
const ACTIVE_STATUSES = ['requested', 'confirmed', 'on_the_way', 'in_progress'];

const TRANSITIONS = {
  requested: ['confirmed', 'declined', 'cancelled'],
  confirmed: ['on_the_way', 'in_progress', 'cancelled'],
  on_the_way: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
  declined: []
};

// Which kind of person may trigger each target status.
const ACTORS = {
  confirmed: ['provider'],
  declined: ['provider'],
  on_the_way: ['provider'],
  in_progress: ['provider'],
  completed: ['provider'],
  cancelled: ['resident', 'provider', 'admin']
};

const isActive = (status) => ACTIVE_STATUSES.includes(status);

const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);

// actor is 'resident', 'provider' or 'admin'. Returns { ok: true } or { ok: false, code: 'state' | 'actor', message }.
const checkTransition = ({ actor, from, to }) => {
  if (!canTransition(from, to)) {
    return { ok: false, code: 'state', message: `A request that is ${from.replace('_', ' ')} cannot become ${to.replace('_', ' ')}.` };
  }
  if (!(ACTORS[to] || []).includes(actor)) {
    return { ok: false, code: 'actor', message: 'You are not allowed to do that on this request.' };
  }
  return { ok: true };
};

// 4-digit code the resident reads out to the provider when the work begins. Proves the provider is at the right door.
const generateStartOtp = () => String(crypto.randomInt(1000, 10000));

const MAX_OTP_ATTEMPTS = 5;

const checkOtp = ({ expected, given, attempts = 0 }) => {
  if (attempts >= MAX_OTP_ATTEMPTS) return { ok: false, locked: true, message: 'Too many wrong codes. Ask the resident to cancel and rebook, or contact the society office.' };
  const a = Buffer.from(String(expected || ''));
  const b = Buffer.from(String(given || '').trim());
  const same = a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
  return same ? { ok: true } : { ok: false, locked: false, message: 'That code is not right. Check it with the resident.' };
};

// Average rating rounded to one decimal, 0 when there are none.
const roundRating = (value) => (Number.isFinite(value) ? Math.round(value * 10) / 10 : 0);

module.exports = {
  STATUSES,
  ACTIVE_STATUSES,
  TRANSITIONS,
  MAX_OTP_ATTEMPTS,
  isActive,
  canTransition,
  checkTransition,
  generateStartOtp,
  checkOtp,
  roundRating
};
