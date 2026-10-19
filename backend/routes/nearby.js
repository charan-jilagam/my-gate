const express = require('express');
const Society = require('../models/Society');
const { query } = require('express-validator');
const { protect } = require('../middleware/auth');
const { findNearby, CATEGORIES } = require('../utils/nearbyPlaces');
const { fail, invalid, serverError, societyFor } = require('../utils/routeKit');
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

// @route   GET /api/nearby/places?category=fuel&radius=1000[&lat=..&lng=..]
// @desc    Places of one kind around the society (or around a point the person gives, such as where they are now).
//          The server asks the free OpenStreetMap services and remembers the answer, so the app never needs a map key.
// @access  Private (everyone with a society)
router.get(
  '/places',
  protect,
  [
    query('category').isIn(Object.keys(CATEGORIES)).withMessage('Unknown kind of place'),
    query('radius').optional().isInt({ min: 100, max: 10000 }).withMessage('Distance must be between 100 and 10000 metres'),
    query('lat').optional().isFloat({ min: -90, max: 90 }),
    query('lng').optional().isFloat({ min: -180, max: 180 })
  ],
  async (req, res) => {
    try {
      if (invalid(req, res)) return undefined;
      let { lat, lng } = req.query;
      if (lat === undefined || lng === undefined) {
        const societyId = societyFor(req);
        const society = societyId && (await Society.findById(societyId).select('location').lean());
        const loc = society && society.location;
        if (!loc || !isCoord(loc.lat, loc.lng)) return fail(res, 409, 'The society is not on the map yet. Ask the office to add its address.');
        lat = loc.lat;
        lng = loc.lng;
      }
      const result = await findNearby({ category: req.query.category, lat, lng, radius: req.query.radius });
      res.json({ success: true, category: req.query.category, radiusMeters: result.radius, count: result.places.length, places: result.places });
      return undefined;
    } catch (error) {
      if (error.status === 400) return fail(res, 400, error.message);
      console.error('Nearby places failed:', error.message);
      return fail(res, 502, 'The map service is busy right now. Please try again in a moment.');
    }
  }
);

module.exports = router;
