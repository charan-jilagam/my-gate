const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

// Protect routes - verify JWT token
exports.protect = async (req, res, next) => {
  // Already authenticated earlier in this request (for example by a router.param guard).
  if (req.user) return next();
  try {
    let token;

    // Check for token in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from token
      req.user = await User.findById(decoded.id).select('-password');
      
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User no longer exists'
        });
      }

      // Residents, guards, staff and vendors can use the API only after an admin approves them.
      if (['resident', 'security', 'guard_admin', 'staff', 'vendor'].includes(req.user.role) && !req.user.isApproved && req.user.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Your account is pending approval from society admin'
        });
      }

      if (!req.user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'User account is deactivated'
        });
      }

      // Check if resident is approved
      if (req.user.role === 'resident' && !req.user.isApproved) {
        return res.status(403).json({
          success: false,
          message: 'Your account is pending approval from society admin'
        });
      }

      next();
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Grant access to specific roles
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user.role}' is not authorized to access this route`
      });
    }
    next();
  };
};

// Check if user belongs to same society
exports.checkSocietyAccess = (req, res, next) => {
  // Super admin can access all societies
  if (req.user.role === 'super_admin') {
    return next();
  }

  // For society-specific routes, check if user's societyId matches
  const requestedSocietyId = req.params.societyId || req.body.societyId || req.query.societyId;
  
  if (requestedSocietyId && req.user.societyId) {
    if (requestedSocietyId.toString() !== req.user.societyId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this society'
      });
    }
  }

  next();
};

// router.param('id', scopeToSociety(Model)): a user may only touch records from their own society.
// Runs the login check itself because param callbacks run before the route's own middleware.
exports.scopeToSociety = (Model, field = 'societyId') => (req, res, next, id) => {
  exports.protect(req, res, async (err) => {
    if (err) return next(err);
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(404).json({ success: false, message: 'Not found' });
      }
      if (req.user.role === 'super_admin') return next();
      const doc = await Model.findById(id).select(field).lean();
      if (doc && String(doc[field]) !== String(req.user.societyId)) {
        return res.status(403).json({ success: false, message: 'Not authorized' });
      }
      next();
    } catch (e) {
      next(e);
    }
  });
};

// Same idea for /societies/:id, where the id is the society itself.
exports.scopeToOwnSociety = (req, res, next, id) => {
  exports.protect(req, res, (err) => {
    if (err) return next(err);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }
    if (req.user.role !== 'super_admin' && String(id) !== String(req.user.societyId)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    next();
  });
};
