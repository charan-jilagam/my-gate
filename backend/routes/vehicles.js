const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Vehicle = require('../models/Vehicle');
const { protect, authorize, checkSocietyAccess , scopeToSociety } = require('../middleware/auth');
router.param('id', scopeToSociety(require('../models/Vehicle')));
const { notifyUser } = require('../utils/notifyUser');

// @route   POST /api/vehicles/register
// @desc    Register a vehicle
// @access  Private (Residents)
router.post('/register', protect, authorize('resident'), [
  body('vehicleNumber').trim().notEmpty().withMessage('Vehicle number is required'),
  body('vehicleType').isIn(['car', 'bike', 'scooter', 'bicycle', 'other']).withMessage('Invalid vehicle type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      vehicleNumber,
      vehicleType,
      brand,
      model,
      color,
      registrationProof,
      parkingSlot
    } = req.body;

    // Check if vehicle already exists
    const existingVehicle = await Vehicle.findOne({
      vehicleNumber: vehicleNumber.toUpperCase(),
      societyId: req.user.societyId
    });

    if (existingVehicle) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle already registered'
      });
    }

    const vehicle = await Vehicle.create({
      residentId: req.user.id,
      societyId: req.user.societyId,
      vehicleNumber: vehicleNumber.toUpperCase(),
      vehicleType,
      brand,
      model,
      color,
      registrationProof,
      parkingSlot,
      flatNo: req.user.flatNo,
      block: req.user.block
    });

    res.status(201).json({
      success: true,
      vehicle,
      message: 'Vehicle registered successfully'
    });
  } catch (error) {
    console.error('Vehicle registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/vehicles
// @desc    Get vehicles
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let query = {};

    if (req.user.role === 'resident') {
      query.residentId = req.user.id;
    } else if (req.user.role === 'super_admin') {
      // Super admin sees all vehicles
    } else if (['security', 'society_admin'].includes(req.user.role)) {
      query.societyId = req.user.societyId;
    }

    if (req.query.isInside !== undefined) {
      query.isInside = req.query.isInside === 'true';
    }

    if (req.user.role !== 'super_admin') query.societyId = req.user.societyId;

    const vehicles = await Vehicle.find(query)
      .populate('residentId', 'name phone flatNo')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: vehicles.length,
      vehicles
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

const canManageVehicle = (user, vehicle) =>
  user.role === 'super_admin' ||
  (user.role === 'society_admin' && vehicle.societyId.toString() === user.societyId?.toString()) ||
  (user.role === 'resident' && vehicle.residentId.toString() === user.id);

// @route   PUT /api/vehicles/:id
// @desc    Edit vehicle details
// @access  Private (owner, society admin)
router.put('/:id', protect, authorize('resident', 'society_admin', 'super_admin'), [
  body('vehicleNumber').optional().trim().notEmpty().withMessage('Vehicle number is required'),
  body('vehicleType').optional().isIn(['car', 'bike', 'scooter', 'bicycle', 'other']).withMessage('Invalid vehicle type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });
    if (!canManageVehicle(req.user, vehicle)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    if (req.body.vehicleNumber) {
      const number = req.body.vehicleNumber.toUpperCase().trim();
      if (number !== vehicle.vehicleNumber) {
        const clash = await Vehicle.findOne({ vehicleNumber: number, societyId: vehicle.societyId, _id: { $ne: vehicle._id } });
        if (clash) return res.status(400).json({ success: false, message: 'Another vehicle already uses that number' });
        vehicle.vehicleNumber = number;
      }
    }
    ['vehicleType', 'brand', 'model', 'color'].forEach((f) => {
      if (req.body[f] !== undefined) vehicle[f] = req.body[f];
    });
    await vehicle.save();

    res.json({ success: true, vehicle, message: 'Vehicle updated' });
  } catch (error) {
    console.error('Edit vehicle error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   DELETE /api/vehicles/:id
// @desc    Remove a vehicle
// @access  Private (owner, society admin)
router.delete('/:id', protect, authorize('resident', 'society_admin', 'super_admin'), async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });
    if (!canManageVehicle(req.user, vehicle)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (vehicle.isInside) {
      return res.status(400).json({ success: false, message: 'This vehicle is inside the society right now. Ask the guard to log its exit first.' });
    }
    await vehicle.deleteOne();
    res.json({ success: true, message: 'Vehicle removed' });
  } catch (error) {
    console.error('Delete vehicle error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/vehicles/:id
// @desc    Get single vehicle
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id)
      .populate('residentId', 'name phone flatNo');

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }

    if (req.user.role === 'resident' && vehicle.residentId._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this vehicle'
      });
    }

    res.json({
      success: true,
      vehicle
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/vehicles/:id/entry
// @desc    Log vehicle entry
// @access  Private (Security)
router.post('/:id/entry', protect, authorize('security', 'society_admin', 'super_admin'), [
  body('entryGate').optional().trim(),
  body('purpose').optional().trim(),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }

    if (vehicle.isInside) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle is already inside'
      });
    }

    const entryLog = {
      entryTime: new Date(),
      entryGate: req.body.entryGate || 'Main Gate',
      loggedBy: req.user.id,
      purpose: req.body.purpose,
      notes: req.body.notes
    };

    vehicle.entryLogs.push(entryLog);
    vehicle.isInside = true;
    vehicle.lastEntryTime = new Date();

    await vehicle.save();

    // Notify resident
    const io = req.app.get('io');
    if (io) {
      await notifyUser(io, vehicle.residentId, {
        societyId: vehicle.societyId,
        type: 'vehicle_entry',
        title: 'Vehicle Entry',
        message: `Your vehicle ${vehicle.vehicleNumber} has entered the society`,
        relatedId: vehicle._id,
        relatedModel: 'Vehicle',
        actionUrl: `/vehicles/${vehicle._id}`
      });
    }

    res.json({
      success: true,
      vehicle,
      message: 'Vehicle entry logged successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/vehicles/:id/exit
// @desc    Log vehicle exit
// @access  Private (Security)
router.post('/:id/exit', protect, authorize('security', 'society_admin', 'super_admin'), [
  body('exitGate').optional().trim(),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }

    if (!vehicle.isInside) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle is not inside'
      });
    }

    // Find the latest entry log without exit time
    const latestEntry = vehicle.entryLogs[vehicle.entryLogs.length - 1];
    if (latestEntry && !latestEntry.exitTime) {
      latestEntry.exitTime = new Date();
      latestEntry.exitGate = req.body.exitGate || 'Main Gate';
      latestEntry.notes = req.body.notes || latestEntry.notes;
    }

    vehicle.isInside = false;
    vehicle.lastExitTime = new Date();

    await vehicle.save();

    // Notify resident
    const io = req.app.get('io');
    if (io) {
      await notifyUser(io, vehicle.residentId, {
        societyId: vehicle.societyId,
        type: 'vehicle_exit',
        title: 'Vehicle Exit',
        message: `Your vehicle ${vehicle.vehicleNumber} has exited the society`,
        relatedId: vehicle._id,
        relatedModel: 'Vehicle',
        actionUrl: `/vehicles/${vehicle._id}`
      });
    }

    res.json({
      success: true,
      vehicle,
      message: 'Vehicle exit logged successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/vehicles/search/:vehicleNumber
// @desc    Search vehicle by number
// @access  Private (Security, Admins)
router.get('/search/:vehicleNumber', protect, authorize('security', 'society_admin', 'super_admin'), async (req, res) => {
  try {
    const vehicle = await Vehicle.findOne({
      vehicleNumber: req.params.vehicleNumber.toUpperCase(),
      societyId: req.user.societyId
    })
      .populate('residentId', 'name phone flatNo');

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Vehicle not found'
      });
    }

    res.json({
      success: true,
      vehicle
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
