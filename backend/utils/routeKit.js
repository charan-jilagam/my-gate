const { validationResult } = require('express-validator');

// Small helpers shared by the newer route files.
const fail = (res, status, message) => res.status(status).json({ success: false, message });

// Sends a 400 and returns true when validation failed.
const invalid = (req, res) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
  return true;
};

const serverError = (res, error, where) => {
  console.error(`${where}:`, error);
  return fail(res, 500, 'Server error');
};

const ADMIN_ROLES = ['society_admin', 'super_admin'];
const isAdminRole = (user) => ADMIN_ROLES.includes(user.role);

const OBJECT_ID = /^[a-f\d]{24}$/i;

// Which society a request is about. Super admins have none of their own and pass ?societyId=.
// A malformed id counts as "none" so it never reaches a query.
const societyFor = (req) => {
  if (req.user.role !== 'super_admin') return req.user.societyId;
  const id = req.query.societyId || (req.body && req.body.societyId);
  return typeof id === 'string' && OBJECT_ID.test(id) ? id : undefined;
};

// ?limit= and ?skip= from the query string, clamped so a negative or silly value cannot cause an error.
const paging = (req, { max = 100, fallback = 50 } = {}) => {
  const limit = parseInt(req.query.limit, 10);
  const skip = parseInt(req.query.skip, 10);
  return { limit: Math.min(Math.max(Number.isFinite(limit) ? limit : fallback, 1), max), skip: Math.max(Number.isFinite(skip) ? skip : 0, 0) };
};

// Only links that point at an uploaded file (this server or https). Blocks javascript: and data: URLs.
const isSafeUrl = (value) => typeof value === 'string' && value.length <= 500 && (/^\/uploads\/[\w./-]+$/.test(value) && !value.includes('..') || /^https:\/\/[^\s]+$/.test(value));

const flatLabel = (u) => (u && u.flatNo ? `${u.block ? `${u.block}-` : ''}${u.flatNo}` : '');

// "Floor 2" from a flat number like 210 or A-1204. Only a guess from the number, so callers label it as such.
const floorOf = (flatNo) => {
  const digits = String(flatNo || '').match(/\d+/g);
  if (!digits) return '';
  const n = parseInt(digits[digits.length - 1], 10);
  if (!Number.isFinite(n)) return '';
  if (digits[digits.length - 1].length <= 2) return n === 0 ? '' : 'Ground floor';
  const f = Math.floor(n / 100);
  return f === 0 ? 'Ground floor' : `Floor ${f}`;
};

module.exports = { floorOf, fail, invalid, serverError, ADMIN_ROLES, isAdminRole, societyFor, paging, isSafeUrl, flatLabel };
