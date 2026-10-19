const express = require('express');
const Society = require('../models/Society');
const { protect } = require('../middleware/auth');
const { serverError, societyFor } = require('../utils/routeKit');
const { isCoord } = require('../utils/geo');

const router = express.Router();

// The area around the society that the map circles and "nearby" searches use.
const AREA_METERS = 1000;

// @route   GET /api/nearby/home
// @desc    Where the society is (name, address, pin), so any signed-in person can find places around it.
// @access  Private (everyone with a society)
router.get('/home', protect, async (req, res) => {
  try {
    const societyId = societyFor(req);
    if (!societyId) return res.json({ success: true, home: null, areaMeters: AREA_METERS });
    const society = await Society.findById(societyId).select('name address location').lean();
    if (!society) return res.json({ success: true, home: null, areaMeters: AREA_METERS });
    const loc = society.location || {};
    const a = society.address || {};
    const pinned = isCoord(loc.lat, loc.lng);
    res.json({
      success: true,
      areaMeters: AREA_METERS,
      home: {
        name: society.name,
        label: loc.label || society.name,
        address: loc.address || [a.street, a.city, a.state, a.pincode].filter(Boolean).join(', '),
        lat: pinned ? loc.lat : null,
        lng: pinned ? loc.lng : null
      }
    });
    return undefined;
  } catch (error) {
    return serverError(res, error, 'Get nearby home');
  }
});

module.exports = router;
