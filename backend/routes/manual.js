const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { manualFor } = require('../content/manual');

// @route   GET /api/manual
// @desc    The user manual for the signed-in user's own role. There is no way to ask for another role's manual:
//          the role comes from the verified account, never from the request.
// @access  Private
router.get('/', protect, (req, res) => {
  const manual = manualFor(req.user.role);
  if (!manual) return res.status(404).json({ success: false, message: 'There is no guide for your role yet.' });
  res.set('Cache-Control', 'private, no-store');
  res.json({ success: true, manual });
  return undefined;
});

module.exports = router;
