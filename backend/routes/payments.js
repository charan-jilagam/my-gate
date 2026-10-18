const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Payment = require('../models/Payment');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { protect, authorize , scopeToSociety } = require('../middleware/auth');
router.param('id', scopeToSociety(require('../models/Payment')));
const { notifyUser } = require('../utils/notifyUser');

// Initialize Razorpay only if credentials are provided
let razorpay = null;
if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
} else {
  console.warn('⚠️  Razorpay credentials not configured. Payment features will be disabled.');
}

// @route   GET /api/payments/config
// @desc    Whether online payments are available, plus the public Razorpay key for checkout
// @access  Private
router.get('/config', protect, (req, res) => {
  res.json({
    success: true,
    enabled: !!razorpay,
    keyId: razorpay ? process.env.RAZORPAY_KEY_ID : null
  });
});

// @route   POST /api/payments/create-order
// @desc    Create Razorpay order
// @access  Private (Residents)
router.post('/create-order', protect, authorize('resident'), [
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be at least 1'),
  body('type').isIn(['maintenance', 'fine', 'amenity_booking', 'other']).withMessage('Invalid payment type'),
  body('month').optional().matches(/^\d{4}-\d{2}$/).withMessage('Month must be in YYYY-MM format'),
  body('description').optional().trim()
], async (req, res) => {
  try {
    // Check if Razorpay is configured
    if (!razorpay) {
      return res.status(503).json({
        success: false,
        message: 'Payment gateway is not configured. Please contact administrator.'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { amount, type, month, year, description, breakdown, dueDate } = req.body;

    // Create payment record
    const payment = await Payment.create({
      residentId: req.user.id,
      societyId: req.user.societyId,
      amount,
      type,
      month,
      year,
      description,
      breakdown,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      flatNo: req.user.flatNo,
      block: req.user.block,
      status: 'pending'
    });

    // Create Razorpay order
    const options = {
      amount: amount * 100, // Convert to paise
      currency: 'INR',
      receipt: `receipt_${payment._id}`,
      notes: {
        paymentId: payment._id.toString(),
        residentId: req.user.id.toString(),
        type
      }
    };

    const order = await razorpay.orders.create(options);

    // Update payment with order ID
    payment.razorpayOrderId = order.id;
    await payment.save();

    res.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt
      },
      paymentId: payment._id,
      keyId: process.env.RAZORPAY_KEY_ID,
      message: 'Order created successfully'
    });
  } catch (error) {
    console.error('Payment order creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   POST /api/payments/verify
// @desc    Verify Razorpay payment
// @access  Private (Residents)
router.post('/verify', protect, authorize('resident'), [
  body('razorpay_order_id').notEmpty().withMessage('Order ID is required'),
  body('razorpay_payment_id').notEmpty().withMessage('Payment ID is required'),
  body('razorpay_signature').notEmpty().withMessage('Signature is required'),
  body('paymentId').notEmpty().withMessage('Payment ID is required')
], async (req, res) => {
  try {
    // Check if Razorpay is configured
    if (!razorpay) {
      return res.status(503).json({
        success: false,
        message: 'Payment gateway is not configured. Please contact administrator.'
      });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      paymentId
    } = req.body;

    const payment = await Payment.findById(paymentId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    if (payment.residentId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    // Verify signature
    const generated_signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + '|' + razorpay_payment_id)
      .digest('hex');

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

    // Update payment
    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.status = 'completed';
    payment.paidAt = new Date();
    payment.transactionId = razorpay_payment_id;

    // Generate receipt URL (in production, generate PDF)
    payment.receiptUrl = `${process.env.FRONTEND_URL}/receipts/${payment._id}`;

    await payment.save();

    // Notify admins
    const io = req.app.get('io');
    if (io) {
      const User = require('../models/User');
      const admins = await User.find({
        societyId: req.user.societyId,
        role: { $in: ['society_admin', 'super_admin'] }
      });

      for (const admin of admins) {
        await notifyUser(io, admin._id, {
          societyId: req.user.societyId,
          type: 'payment_received',
          title: 'Payment Received',
          message: `${req.user.name} (${req.user.flatNo}) made a payment of ₹${payment.amount}`,
          relatedId: payment._id,
          relatedModel: 'Payment',
          actionUrl: `/payments/${payment._id}`
        });
      }

      await notifyUser(io, req.user.id, {
        societyId: req.user.societyId,
        type: 'payment_received',
        title: 'Payment Successful',
        email: true,
        message: `Your payment of ₹${payment.amount} has been received`,
        relatedId: payment._id,
        relatedModel: 'Payment',
        actionUrl: `/payments/${payment._id}`
      });
    }

    res.json({
      success: true,
      payment,
      message: 'Payment verified successfully'
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/payments
// @desc    Get payments
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let query = {};

    if (req.user.role === 'resident') {
      query.residentId = req.user.id;
    } else if (req.user.role === 'super_admin') {
      // Super admin sees all payments
    } else if (req.user.role === 'society_admin') {
      query.societyId = req.user.societyId;
    }

    if (req.query.status) {
      query.status = req.query.status;
    }

    if (req.query.type) {
      query.type = req.query.type;
    }

    if (req.query.month) {
      query.month = req.query.month;
    }

    if (req.user.role !== 'super_admin') query.societyId = req.user.societyId;

    const payments = await Payment.find(query)
      .populate('residentId', 'name flatNo')
      .sort({ createdAt: -1 })
      .limit(Math.min(parseInt(req.query.limit) || 200, 500))
      .skip(parseInt(req.query.skip) || 0);

    res.json({
      success: true,
      count: payments.length,
      payments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// ---- Admin: dues, cash/cheque records, collections summary ----
const ADMINS = ['society_admin', 'super_admin'];
const adminSocietyId = (req) => (req.user.role === 'super_admin' ? req.body.societyId || req.query.societyId : req.user.societyId);

// @route   POST /api/payments/generate
// @desc    Create dues (e.g. monthly maintenance) for all approved residents, or chosen ones
// @access  Private (Admins)
router.post('/generate', protect, authorize(...ADMINS), [
  body('type').optional().isIn(['maintenance', 'fine', 'other']).withMessage('Invalid type'),
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be at least 1'),
  body('month').optional().matches(/^\d{4}-\d{2}$/).withMessage('Month must be YYYY-MM'),
  body('dueDate').optional().isISO8601().withMessage('Invalid due date'),
  body('description').optional().trim().isLength({ max: 200 }),
  body('residentIds').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const societyId = adminSocietyId(req);
    if (!societyId) return res.status(400).json({ success: false, message: 'Society is required' });

    const type = req.body.type || 'maintenance';
    const { amount, month, dueDate, description, residentIds } = req.body;
    if (type === 'maintenance' && !month) {
      return res.status(400).json({ success: false, message: 'Choose the month these dues are for' });
    }

    const User = require('../models/User');
    const filter = { societyId, role: 'resident', isApproved: true, isActive: true };
    if (Array.isArray(residentIds) && residentIds.length) filter._id = { $in: residentIds };
    const residents = await User.find(filter).select('name flatNo block');
    if (!residents.length) {
      return res.status(400).json({ success: false, message: 'No approved residents to bill' });
    }

    // Do not bill the same flat twice for the same month of maintenance.
    let skipped = 0;
    let todo = residents;
    if (type === 'maintenance') {
      const existing = await Payment.find({
        societyId, type: 'maintenance', month, status: { $in: ['pending', 'processing', 'completed'] }
      }).select('residentId');
      const billed = new Set(existing.map((p) => p.residentId.toString()));
      todo = residents.filter((r) => !billed.has(r._id.toString()));
      skipped = residents.length - todo.length;
    }

    const docs = todo.map((r) => ({
      residentId: r._id,
      societyId,
      amount,
      type,
      month,
      year: month ? Number(month.slice(0, 4)) : undefined,
      description: description || (type === 'maintenance' ? `Maintenance for ${month}` : undefined),
      dueDate: dueDate ? new Date(dueDate) : undefined,
      flatNo: r.flatNo || '-',
      block: r.block,
      status: 'pending'
    }));
    const created = docs.length ? await Payment.insertMany(docs) : [];

    const io = req.app.get('io');
    if (io) {
      for (const p of created) {
        try {
          await notifyUser(io, p.residentId, {
            societyId,
            type: 'payment_due',
            title: 'New payment due',
            sms: true,
            email: true,
            message: `₹${p.amount} is due${p.month ? ` for ${p.month}` : ''}${p.description && !p.month ? `: ${p.description}` : ''}`,
            relatedId: p._id,
            relatedModel: 'Payment',
            actionUrl: '/payments'
          });
        } catch (e) { /* a failed notification must not undo the dues */ }
      }
    }

    res.status(201).json({
      success: true,
      created: created.length,
      skipped,
      message: `Created dues for ${created.length} flat${created.length === 1 ? '' : 's'}${skipped ? ` (${skipped} already billed)` : ''}`
    });
  } catch (error) {
    console.error('Generate dues error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/payments/admin/summary
// @desc    Collected vs pending totals, optionally for one month
// @access  Private (Admins)
router.get('/admin/summary', protect, authorize(...ADMINS), async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const match = {};
    const societyId = adminSocietyId(req);
    if (req.user.role === 'society_admin' || societyId) match.societyId = new mongoose.Types.ObjectId(String(societyId));
    if (req.query.month) match.month = req.query.month;

    const rows = await Payment.aggregate([
      { $match: match },
      { $group: { _id: '$status', total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);
    const pick = (s) => rows.find((r) => r._id === s) || { total: 0, count: 0 };
    res.json({
      success: true,
      summary: {
        collected: pick('completed').total,
        collectedCount: pick('completed').count,
        pending: pick('pending').total + pick('processing').total,
        pendingCount: pick('pending').count + pick('processing').count
      }
    });
  } catch (error) {
    console.error('Payment summary error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PUT /api/payments/:id/mark-paid
// @desc    Record a payment received outside the app (cash, cheque, UPI, card)
// @access  Private (Admins)
router.put('/:id/mark-paid', protect, authorize(...ADMINS), [
  body('paymentMethod').isIn(['cash', 'cheque', 'upi', 'card']).withMessage('Choose how it was paid'),
  body('reference').optional().trim().isLength({ max: 80 }),
  body('notes').optional().trim().isLength({ max: 200 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (req.user.role === 'society_admin' && payment.societyId.toString() !== req.user.societyId.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (payment.status === 'completed') {
      return res.status(400).json({ success: false, message: 'This payment is already marked as paid' });
    }

    payment.status = 'completed';
    payment.paymentMethod = req.body.paymentMethod;
    payment.paidAt = new Date();
    if (req.body.reference) payment.transactionId = `${req.body.paymentMethod}-${req.body.reference}-${payment._id}`;
    payment.notes = [req.body.reference && `Ref: ${req.body.reference}`, req.body.notes, `Recorded by ${req.user.name}`]
      .filter(Boolean).join(' · ');
    await payment.save();

    const io = req.app.get('io');
    if (io) {
      try {
        await notifyUser(io, payment.residentId, {
          societyId: payment.societyId,
          type: 'payment_received',
          email: true,
          title: 'Payment recorded',
          message: `Your ${req.body.paymentMethod} payment of ₹${payment.amount} was recorded`,
          relatedId: payment._id,
          relatedModel: 'Payment',
          actionUrl: '/payments'
        });
      } catch (e) { /* ignore */ }
    }

    res.json({ success: true, payment, message: 'Payment recorded' });
  } catch (error) {
    console.error('Mark paid error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   POST /api/payments/:id/order
// @desc    Start online payment for an existing pending due
// @access  Private (Residents)
router.post('/:id/order', protect, authorize('resident'), async (req, res) => {
  try {
    if (!razorpay) {
      return res.status(503).json({ success: false, message: 'Online payment is not set up for this society. Please pay the admin directly.' });
    }
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (payment.residentId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (payment.status === 'completed') {
      return res.status(400).json({ success: false, message: 'This payment is already paid' });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(payment.amount * 100),
      currency: 'INR',
      receipt: `receipt_${payment._id}`,
      notes: { paymentId: payment._id.toString(), residentId: req.user.id.toString(), type: payment.type }
    });
    payment.razorpayOrderId = order.id;
    await payment.save();

    res.json({
      success: true,
      order: { id: order.id, amount: order.amount, currency: order.currency, receipt: order.receipt },
      paymentId: payment._id,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error('Order for due error:', error);
    res.status(500).json({ success: false, message: 'Could not start the payment. Please try again.' });
  }
});

// @route   GET /api/payments/:id
// @desc    Get single payment
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('residentId', 'name email phone flatNo');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    if (req.user.role === 'resident' && payment.residentId._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this payment'
      });
    }

    res.json({
      success: true,
      payment
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// @route   GET /api/payments/history/summary
// @desc    Get payment summary
// @access  Private (Residents)
router.get('/history/summary', protect, authorize('resident'), async (req, res) => {
  try {
    const payments = await Payment.find({ residentId: req.user.id });

    const summary = {
      totalPaid: payments
        .filter(p => p.status === 'completed')
        .reduce((sum, p) => sum + p.amount, 0),
      totalPending: payments
        .filter(p => p.status === 'pending')
        .reduce((sum, p) => sum + p.amount, 0),
      totalPayments: payments.length,
      completedPayments: payments.filter(p => p.status === 'completed').length,
      pendingPayments: payments.filter(p => p.status === 'pending').length
    };

    res.json({
      success: true,
      summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

module.exports = router;
