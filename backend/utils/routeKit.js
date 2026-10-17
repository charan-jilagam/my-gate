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

// Which society a request is about. Super admins have none of their own and pass ?societyId=.
const societyFor = (req) => (req.user.role === 'super_admin' ? req.query.societyId || req.body?.societyId : req.user.societyId);

const flatLabel = (u) => (u && u.flatNo ? `${u.block ? `${u.block}-` : ''}${u.flatNo}` : '');

module.exports = { fail, invalid, serverError, ADMIN_ROLES, isAdminRole, societyFor, flatLabel };
