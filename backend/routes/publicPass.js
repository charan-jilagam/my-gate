const express = require('express');
const rateLimit = require('express-rate-limit');
const Visitor = require('../models/Visitor');
const Society = require('../models/Society');
const { floorOf } = require('../utils/routeKit');
const { expiryOf } = require('../utils/visitorPass');

const router = express.Router();

// The link is a 32-character secret, so guessing is hopeless, but keep scrapers slow anyway.
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, validate: false, message: { success: false, message: 'Too many tries. Please wait a few minutes.' } });

// @route   GET /api/public/pass/:passId
// @desc    What the guest sees when they open the link in their message: the QR code, pass code and basic details.
// @access  Public (the link itself is the secret)
router.get('/pass/:passId', limiter, async (req, res) => {
  try {
    const passId = String(req.params.passId || '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(passId)) return res.status(404).json({ success: false, message: 'This pass link is not valid.' });
    const visitor = await Visitor.findOne({ passId }).populate('residentId', 'name');
    if (!visitor) return res.status(404).json({ success: false, message: 'This pass link is not valid.' });
    const society = await Society.findById(visitor.societyId).select('name').lean();

    const expiresAt = expiryOf(visitor);
    const usable = visitor.status === 'approved';
    const expired = usable && !!expiresAt && Date.now() > expiresAt.getTime();
    const host = visitor.residentId && visitor.residentId.name ? String(visitor.residentId.name).trim().split(/\s+/)[0] : 'a resident';

    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      pass: {
        name: visitor.name,
        host,
        society: society ? society.name : '',
        flat: [visitor.block, visitor.flatNo].filter(Boolean).join('-'),
        floor: floorOf(visitor.flatNo) || '',
        purpose: visitor.purpose,
        numberOfVisitors: visitor.numberOfVisitors || 1,
        expectedArrival: visitor.expectedArrival || null,
        plannedExit: visitor.plannedExit || null,
        expiresAt,
        status: visitor.status,
        usable: usable && !expired,
        expired,
        // Only a pass that can still be used shows its QR code and code.
        qr: usable && !expired ? visitor.qrCode : null,
        code: usable && !expired ? passId.slice(0, 8).toUpperCase() : null
      }
    });
  } catch (error) {
    console.error('Public pass error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
