// Permanent entry passes: creating, reading and regenerating a person's pass, and working out whether they are in or out.
const crypto = require('crypto');
const EntryPass = require('../models/EntryPass');
const MemberLog = require('../models/MemberLog');
const User = require('../models/User');
const { generateQRCode } = require('./generateQR');
const { flatLabel } = require('./routeKit');

const newCode = () => crypto.randomBytes(8).toString('hex');

// The code as people see and type it: NV-1a2b-3c4d-5e6f-7a8b. ("NV" cannot be mistaken for a visitor's hex code.)
const display = (code) => `NV-${code.match(/.{4}/g).join('-')}`;

// Accepts the raw 16 hex characters or the NV-xxxx-xxxx-xxxx-xxxx form, any case. Returns the raw code or null.
const parseCode = (input) => {
  const text = String(input || '').trim().toLowerCase().replace(/[\s-]/g, '');
  const raw = text.startsWith('nv') ? text.slice(2) : text;
  return /^[a-f0-9]{16}$/.test(raw) ? raw : null;
};

// People who live in a flat are "family": they are presumed at home and their pass says going out / coming in.
// Everyone else with a pass (guards, staff, admins ...) is presumed outside until they come in.
const livesInFlat = (user) => user.role === 'resident';

// A pass is made the first time it is needed. Two requests at once cannot make two: the unique index settles it.
const ensurePass = async (user) => {
  const existing = await EntryPass.findOne({ userId: user._id });
  if (existing) return existing;
  try {
    return await EntryPass.create({ userId: user._id, societyId: user.societyId, code: newCode() });
  } catch (e) {
    if (e.code === 11000) {
      const again = await EntryPass.findOne({ userId: user._id });
      if (again) return again;
    }
    throw e;
  }
};

// Swaps the secret code. The old QR stops working at once.
const regenerate = async (user, byUserId) => {
  const pass = await ensurePass(user);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      pass.code = newCode();
      pass.version = (pass.version || 1) + 1;
      pass.regeneratedAt = new Date();
      pass.regeneratedBy = byUserId;
      // eslint-disable-next-line no-await-in-loop
      await pass.save();
      return pass;
    } catch (e) {
      if (e.code !== 11000) throw e;
    }
  }
  throw new Error('Could not make a new pass code');
};

// Who may see, download or regenerate a person's pass.
const canManagePass = (actor, target) => {
  if (actor.role === 'super_admin') return true;
  if (String(actor._id || actor.id) === String(target._id)) return true;
  if (String(actor.societyId) !== String(target.societyId)) return false;
  if (actor.role === 'society_admin') return true;
  if (target.householdHeadId && String(target.householdHeadId) === String(actor._id || actor.id)) return true;
  if (actor.role === 'guard_admin' && target.role === 'security') return true;
  return false;
};

const photoOf = (u) => u.profilePic || '';

// Whether the person is inside right now, from their last gate event.
const presenceOf = (user, last) => {
  if (!last) return { inside: livesInFlat(user), since: null, known: false };
  return { inside: last.action === 'in', since: last.at, known: true };
};

const lastEvent = (userId) => MemberLog.findOne({ userId }).sort({ at: -1 });

// What a guard (or the owner) sees about a person.
const present = async (user, last) => {
  let head = null;
  if (user.householdHeadId) head = await User.findById(user.householdHeadId).select('name phone');
  const p = presenceOf(user, last);
  return {
    _id: user._id,
    name: user.name,
    role: user.role,
    relation: user.relation || '',
    phone: user.phone,
    photo: photoOf(user),
    flat: flatLabel(user),
    flatNo: user.flatNo || '',
    block: user.block || '',
    isFamily: livesInFlat(user),
    isHead: livesInFlat(user) && !user.householdHeadId,
    headName: head ? head.name : '',
    isActive: user.isActive !== false,
    inside: p.inside,
    since: p.since
  };
};

const qrImage = (pass) => generateQRCode({ type: 'member', code: pass.code });

module.exports = { newCode, display, parseCode, livesInFlat, ensurePass, regenerate, canManagePass, presenceOf, lastEvent, present, qrImage };
